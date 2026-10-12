import { useEffect, useCallback, useRef } from 'react';
import websocketService from '../services/websocket';
import chatWebsocketService from '../services/chatWebsocket';
import logger from '../utils/logger';
import { ActionTypes, DataTypes, shortId } from '../utils';

/**
 * Custom hook to encapsulate WebSocket logic for Data Extraction Agent.
 * Handles:
 * - Event listener registration
 * - Streaming data processing (streamRowData)
 * - Status updates (indexing, uploading)
 * - Chat responses and validation
 */
export const useExtractionWebSocket = ({
    sessionId,
    dispatch,
    setUploadedFiles,
    setFileProgress,
    setUploadStatus,
    setExtractionStatus,
    setIsThinking,
    setThinkingMessage,
    setIsChatTyping,
    setChatMessages,
    setPendingModification,
    setShowFieldLimitModal,
    setFieldLimitData,
    stateRef,
    columnRegistryRef,
    openSourceViewer,
    setUpdatingColumns,
    fileRowMapRef,
    setCurrentPage, // ✅ Accepted prop
    currentPage, // ✅ Accepted prop [COMMENT 2]
    replacedColumnPositionRef // ✅ Accepted prop [COMMENT 3]
}) => {

    // [COMMENT 1] Track streaming state and placeholder ages for conservative cleanup
    const isStreamingRef = useRef(false);
    const placeholderAgesRef = useRef(new Map()); // Map<"rowIndex:colId", timestamp>

    // ✅ CRITICAL FIX: Synchronous lock to prevent race conditions during high-speed streaming
    // Tracks which "Column X" labels have been claimed but not yet updated in React state
    const claimedColumnsRef = useRef(new Set());

    // ✅ NEW: Pending data queue for data that arrives before column exists in state
    // Map<columnName, Array<{data, attempts}>>
    const pendingDataQueueRef = useRef(new Map());

    // ✅ NEW: Pending animation targets for columns that don't exist yet
    // When extraction_targeting arrives BEFORE columns are created, store the targets here
    // { rowIndices: number[], columnNames: string[] }
    const pendingAnimationTargetsRef = useRef(null);

    // ✅ FIX: Track last message content to prevent duplicates (MUST persist across renders!)
    const lastMessageContentRef = useRef('');
    const lastMessageTimeRef = useRef(0);

    // Reset locks when session changes
    useEffect(() => {
        claimedColumnsRef.current.clear();
        pendingDataQueueRef.current.clear();
        pendingAnimationTargetsRef.current = null;
        // ✅ FIX: Reset dedup refs for new session
        lastMessageContentRef.current = '';
        lastMessageTimeRef.current = 0;
    }, [sessionId]);

    // Helper to map backend type strings to Frontend DataTypes enum
    const mapBackendTypeToFrontend = (typeStr) => {
        if (!typeStr) return DataTypes.TEXT;
        const lower = typeStr.toLowerCase();
        switch (lower) {
            case 'number':
            case 'numeric':
            case 'float':
            case 'int':
            case 'integer':
                return DataTypes.NUMBER;
            case 'select':
            case 'dropdown':
                return DataTypes.SELECT;
            case 'file':
            case 'document':
                return DataTypes.FILE;
            case 'text':
            case 'string':
            default:
                return DataTypes.TEXT;
        }
    };




    useEffect(() => {
        if (!sessionId) return;

        logger.debug(`[WS-HOOK] Initializing listeners for session ${sessionId}`);

        // --- Event Handlers ---

        const handleWelcome = (data) => {
            logger.debug('WebSocket Welcome:', data);
        };

        const handleUploadProgress = (data) => {
            logger.info('⏳ Upload progress:', data);
            setUploadStatus('processing');
        };

        const handleUploadComplete = (data) => {
            logger.important('✅ Upload complete:', data);

            // FIXED: Append new files to existing file list instead of replacing
            const newFiles = data.files || [];
            setUploadedFiles(prev => {
                // Deduplicate by file_id or filename
                const existingIds = new Set(prev.map(f => f.file_id || f.filename));
                const filesToAdd = newFiles.filter(f => !existingIds.has(f.file_id || f.filename));
                const merged = [...prev, ...filesToAdd];
                logger.debug(`[UPLOAD_COMPLETE] Merged files: ${prev.length} existing + ${filesToAdd.length} new = ${merged.length} total`);
                return merged;
            });

            // ✅ FIX: Do NOT set status to 'complete' here!
            // upload_complete just means files are uploaded to Gemini File API.
            // We need to wait for 'indexingComplete' which means files are indexed and ready.
            // Setting ready_for_extraction is fine, but navigation should wait for indexingComplete.
            setExtractionStatus('ready_for_extraction');
            // setUploadStatus('complete');  // ❌ REMOVED - This was causing premature navigation!
            logger.debug('[UPLOAD_COMPLETE] Files added, waiting for indexingComplete signal for navigation...');

            // FIXED: Add rows to table for any new files that don't have rows yet
            if (newFiles.length > 0) {
                const docCol = stateRef.current.columns.find(c => c.label === 'Document Name' || c.dataType === DataTypes.FILE);
                const docColId = docCol ? docCol.id : 'Document Name';
                const existingDocNames = new Set(stateRef.current.data.map(row => {
                    const raw = row[docColId] || row['Document Name'];
                    return typeof raw === 'object' ? (raw?.value || raw?.text) : raw;
                }));

                newFiles.forEach(file => {
                    const displayName = file.display_name || file.filename;
                    if (displayName && !existingDocNames.has(displayName)) {
                        const emptyRowIndex = stateRef.current.data.findIndex(row => {
                            const raw = row[docColId] || row['Document Name'];
                            const text = typeof raw === 'object' ? (raw?.value || raw?.text) : raw;
                            return !text || String(text).trim() === '';
                        });
                        if (emptyRowIndex >= 0) {
                            dispatch({
                                type: ActionTypes.UPDATE_CELL,
                                rowIndex: emptyRowIndex,
                                columnId: docColId,
                                value: displayName
                            });
                            logger.debug(`[UPLOAD_COMPLETE] Filled row ${emptyRowIndex + 1} for new file: ${displayName}`);
                        } else {
                            const rowData = { 'Document Name': displayName };
                            rowData[docColId] = displayName;
                            dispatch({
                                type: ActionTypes.ADD_ROW,
                                rowData
                            });
                            logger.debug(`[UPLOAD_COMPLETE] Added table row for new file: ${displayName}`);
                        }
                        existingDocNames.add(displayName);
                    }
                });
            }

            // Initializing file progress
            if (data.files) {
                setFileProgress(prev => {
                    const existingIds = new Set(prev.map(f => f.file_id || f.filename));
                    const newProgress = newFiles
                        .filter(f => !existingIds.has(f.file_id || f.filename))
                        .map(f => ({ ...f, status: 'uploaded', progress: 100 }));
                    return [...prev, ...newProgress];
                });
            }
        };


        const handleFilesStored = (data) => {
            logger.info('💾 Files stored in session:', data);
            // FIXED: Append new files instead of replacing
            const newFiles = data.files || [];
            setUploadedFiles(prev => {
                const existingIds = new Set(prev.map(f => f.file_id || f.filename));
                const filesToAdd = newFiles.filter(f => !existingIds.has(f.file_id || f.filename));
                return [...prev, ...filesToAdd];
            });
        };

        // --- Core Extraction Handlers ---

        const handleCreateColumn = (data) => {
            const colName = data.column_name;
            console.log(`[CREATE_COLUMN] 🏗️ Creating column: "${colName}"`);
            logger.debug(`[WS] create_column received: ${colName} (type: ${data.column_type})`);

            // ✅ FIX: Case-insensitive matching to prevent duplicates like 'CEO' and 'Ceo'
            const normalizeColName = (name) => name?.toLowerCase().trim();
            const colNameLower = normalizeColName(colName);

            // 1. Check registry with case-insensitive matching
            for (const [registeredName, registeredId] of columnRegistryRef.current.entries()) {
                if (normalizeColName(registeredName) === colNameLower) {
                    console.log(`[CREATE_COLUMN] ⏩ Column "${colName}" matches existing "${registeredName}" (case-insensitive) → ${registeredId}`);
                    logger.debug(`[WS] create_column skipped - column '${colName}' matches '${registeredName}' (id: ${registeredId})`);
                    return registeredId;
                }
            }

            // 2. Check existing columns by label (case-insensitive)
            const existingByLabel = stateRef.current.columns.find(c => normalizeColName(c.label) === colNameLower);
            if (existingByLabel) {
                console.log(`[CREATE_COLUMN] ✅ Found existing column by label (case-insensitive): "${colName}" matches "${existingByLabel.label}" → ${existingByLabel.id}`);
                // Add to registry with ORIGINAL column name for future lookups
                columnRegistryRef.current.set(colName, existingByLabel.id);
                return existingByLabel.id;
            }

            // 2. Find first available placeholder
            // Must be:
            // - Labeled "Column" (exact) OR "Column N" (with number)
            // - Not "created" (meaning it's a default/empty placeholder)
            // - Not in registry (already mapped)
            // - Not claimed (in flight)

            // [DEBUG] Extreme Logging for Placeholder Selection
            // ✅ FIX: Match both "Column" and "Column N" patterns
            const isPlaceholderLabel = (label) => label === 'Column' || /^Column \d+$/.test(label);

            // ✅ FIX: Get placeholders WITH their index, then sort by index to ensure LEFT-to-RIGHT order
            // This guarantees new columns are placed in the FIRST available placeholder (closest to existing data)
            const columnsWithIndex = stateRef.current.columns.map((c, idx) => ({ ...c, _idx: idx }));
            const allPlaceholders = columnsWithIndex
                .filter(c => isPlaceholderLabel(c.label))
                .sort((a, b) => a._idx - b._idx); // Sort by index (left to right)

            console.log(`[CREATE_COLUMN] Found ${allPlaceholders.length} placeholders (sorted by position):`, allPlaceholders.map(c => `${c.label}@idx${c._idx}`));

            // ✅ NEW: Use backend column_index for precise placement
            const targetIndex = data.column_index;
            let availablePlaceholder = null;

            // PRIORITY 1: Use column_index to find the EXACT placeholder we should rename
            // Backend sends column_index = 1 for first field (after Document Name at 0)
            // This should map to "Column 1" at index 1 in frontend
            if (typeof targetIndex === 'number' && targetIndex >= 0) {
                // Direct index lookup - find column at exact position
                const columnAtIndex = columnsWithIndex.find(c => c._idx === targetIndex);

                if (columnAtIndex && isPlaceholderLabel(columnAtIndex.label)) {
                    // Check if this placeholder is available (not already claimed or in registry)
                    const isAvailable = !columnAtIndex.created &&
                        !columnRegistryRef.current.has(columnAtIndex.label) &&
                        !claimedColumnsRef.current.has(columnAtIndex.label);

                    if (isAvailable) {
                        availablePlaceholder = columnAtIndex;
                        console.log(`[CREATE_COLUMN] ✅ Using backend column_index ${targetIndex} -> "${columnAtIndex.label}"`);
                    } else {
                        console.log(`[CREATE_COLUMN] ⚠️ Placeholder at index ${targetIndex} ("${columnAtIndex.label}") already claimed/used`);
                    }
                } else {
                    console.log(`[CREATE_COLUMN] ⚠️ No placeholder at index ${targetIndex}, column is: "${columnAtIndex?.label || 'none'}"`);
                }
            }

            // PRIORITY 2: If index-based lookup fails, find the Nth UNCLAIMED placeholder
            // where N = number of already claimed placeholders + 1
            // This ensures sequential order even if messages arrive out of order
            if (!availablePlaceholder) {
                const unclaimedPlaceholders = allPlaceholders.filter(c => {
                    const isCreated = c.created;
                    const inRegistry = columnRegistryRef.current.has(c.label);
                    const isClaimed = claimedColumnsRef.current.has(c.label);
                    return !isCreated && !inRegistry && !isClaimed;
                });

                if (unclaimedPlaceholders.length > 0) {
                    // Take the FIRST unclaimed (sorted by index, so leftmost)
                    availablePlaceholder = unclaimedPlaceholders[0];
                    console.log(`[CREATE_COLUMN] 📍 Fallback: Using first unclaimed placeholder "${availablePlaceholder.label}" at index ${availablePlaceholder._idx}`);
                }
            }

            if (!availablePlaceholder) {
                console.log(`[CREATE_COLUMN] ⚠️ No available placeholders! Will create new column.`);
                logger.warn(`[WS] No placeholders found! Total candidates: ${allPlaceholders.length}.`, {
                    candidates: allPlaceholders.map(c => ({
                        label: c.label,
                        created: c.created,
                        inRegistry: columnRegistryRef.current.has(c.label),
                        claimed: claimedColumnsRef.current.has(c.label)
                    }))
                });
            }

            let colId;

            if (availablePlaceholder) {
                // Use placeholder
                colId = availablePlaceholder.id;
                claimedColumnsRef.current.add(availablePlaceholder.label); // Claim it
                console.log(`[CREATE_COLUMN] ✅ Using placeholder "${availablePlaceholder.label}" -> "${colName}" (id: ${colId})`);

                // Dispatch Rename
                dispatch({
                    type: ActionTypes.UPDATE_COLUMN_HEADER,
                    columnId: colId,
                    label: colName
                });

                // ✅ FIX: Force column type to TEXT always (User Requirement)
                // Ignore backend suggestions like 'number' or 'currency' to prevent data loss/issues
                // User can manually change type later if needed.
                /*
                if (data.column_type) {
                    const frontendType = mapBackendTypeToFrontend(data.column_type);
                    dispatch({
                        type: ActionTypes.UPDATE_COLUMN_TYPE,
                        columnId: colId,
                        dataType: frontendType
                    });
                }
                */

                logger.important(`[WS] Strategy: Renamed placeholder '${availablePlaceholder.label}' -> '${colName}' (id: ${colId}) - Forced Type: TEXT`);
            } else {
                // No placeholders left. Create new.
                const newId = shortId();
                colId = newId;

                // Find anchor column (before the "+" button if it exists, or last column)
                const currentCols = stateRef.current.columns;
                const addColumnBtn = currentCols.find(c => c.label === '+');
                let anchorColId;

                if (addColumnBtn) {
                    const idx = currentCols.indexOf(addColumnBtn);
                    anchorColId = idx > 0 ? currentCols[idx - 1].id : currentCols[0].id;
                } else {
                    anchorColId = currentCols[currentCols.length - 1].id;
                }

                logger.important(`[WS] Strategy: Create new column for '${colName}' (id: ${colId})`);

                dispatch({
                    type: ActionTypes.ADD_COLUMN_TO_RIGHT,
                    columnId: anchorColId,
                    newColumnId: newId // Use our pre-generated ID
                });

                // Wait a tick for dispatch to process? No, we trust the Reducer to be synchronous for next render
                // But specifically for Type update, we might need a second dispatch

                // ✅ FIX: Force column type to TEXT always (User Requirement)
                // Ignore backend suggestions to prevent unwanted type switching
                /*
                if (data.column_type) {
                    const frontendType = mapBackendTypeToFrontend(data.column_type);
                    // We can bundle this? No, separate action for safety.
                    // Or pass type to ADD_COLUMN_TO_RIGHT?
                    // Simplest: Dispatch update type immediately after.
                    dispatch({
                        type: ActionTypes.UPDATE_COLUMN_TYPE,
                        columnId: newId,
                        dataType: frontendType
                    });
                }
                */
            }

            // 3. Update Registry immediately
            columnRegistryRef.current.set(colName, colId);

            // 4. ✅ NEW: Check for pending animation targets and apply them
            const pending = pendingAnimationTargetsRef.current;
            if (pending && pending.rowIndices && pending.rowIndices.length > 0) {
                const shouldAnimate =
                    pending.allColumns || // __ALL__ marker
                    pending.newColumns || // __NEW__ marker
                    pending.columnNames.includes(colName); // Specific column name match

                if (shouldAnimate) {
                    logger.info(`[WS] 🎯 Applying pending animation for new column '${colName}' (id: ${colId})`);

                    // Small delay to let React state update with the new column
                    setTimeout(() => {
                        dispatch({
                            type: ActionTypes.SET_EXTRACTING_CELLS,
                            rowIndices: pending.rowIndices,
                            columnIds: [colId]
                        });
                    }, 50);
                }
            }

            // Return the ID for immediate use
            return colId;
        };

        // ✅ NEW: Handle rename_column from backend (for replace operations)
        const handleRenameColumn = (data) => {
            // ✅ HIGHLY VISIBLE DEBUG LOG
            console.log('%c[RENAME_COLUMN] 🔥 MESSAGE RECEIVED 🔥', 'color: red; font-size: 16px; font-weight: bold');
            console.log('[RENAME_COLUMN] Full data:', JSON.stringify(data, null, 2));

            const { old_column_name, new_column_name } = data;
            logger.debug(`[WS] rename_column received: ${old_column_name} → ${new_column_name}`);

            if (!old_column_name || !new_column_name) {
                logger.warn('[RENAME_COLUMN] Missing column names:', data);
                return;
            }

            // Get current state via reducer's state
            const currentColumns = stateRef.current.columns;
            console.log('[RENAME_COLUMN] Current columns:', currentColumns.map(c => c.label));

            // ✅ FIX: Multi-tier lookup for column to rename
            // 1. Exact label match
            let columnToRename = currentColumns.find(c => c.label === old_column_name);

            // 2. Case-insensitive label match
            if (!columnToRename) {
                const lowerOldName = old_column_name.toLowerCase();
                columnToRename = currentColumns.find(c => c.label?.toLowerCase() === lowerOldName);
                if (columnToRename) {
                    logger.debug(`[RENAME_COLUMN] Found via case-insensitive match: ${columnToRename.label}`);
                }
            }

            // 3. Check registry for registered ID
            if (!columnToRename) {
                const registeredId = columnRegistryRef.current.get(old_column_name);
                if (registeredId) {
                    columnToRename = currentColumns.find(c => c.id === registeredId);
                    if (columnToRename) {
                        logger.debug(`[RENAME_COLUMN] Found via registry: ${registeredId}`);
                    }
                }
            }

            if (columnToRename) {
                logger.debug(`[RENAME_COLUMN] Renaming "${old_column_name}" → "${new_column_name}" (id: ${columnToRename.id})`);

                // Update column registry to reflect new name
                columnRegistryRef.current.delete(old_column_name);
                columnRegistryRef.current.set(new_column_name, columnToRename.id);

                // Dispatch rename action
                dispatch({
                    type: ActionTypes.RENAME_COLUMN,
                    columnId: columnToRename.id,
                    oldLabel: old_column_name,
                    newLabel: new_column_name
                });
            } else {
                // ✅ FIX: If old column not found, PRE-REGISTER new column name
                // This ensures upcoming streamRowData messages can find/create it correctly
                logger.warn(`[RENAME_COLUMN] Column not found: "${old_column_name}". Pre-creating "${new_column_name}".`);
                logger.warn('[RENAME_COLUMN] Available columns:', currentColumns.map(c => c.label));

                // Create the new column immediately so streamRowData can populate it
                const newColId = handleCreateColumn({
                    column_name: new_column_name,
                    column_type: "text"
                });

                if (newColId) {
                    logger.important(`[RENAME_COLUMN] Pre-created column "${new_column_name}" with id: ${newColId}`);
                }
            }
        };

        // ✅ NEW: Handle delete_column from backend
        const handleDeleteColumn = (data) => {
            console.log('%c[DELETE_COLUMN] 🗑️ MESSAGE RECEIVED 🗑️', 'color: red; font-size: 16px; font-weight: bold');
            console.log('[DELETE_COLUMN] Full data:', JSON.stringify(data, null, 2));

            const columnName = data.column_name;
            logger.debug(`[WS] delete_column received: ${columnName}`);

            if (!columnName) {
                logger.warn('[DELETE_COLUMN] Missing column_name:', data);
                return;
            }

            // Never delete Document Name
            if (columnName === 'Document Name' || columnName.toLowerCase() === 'document name') {
                logger.warn('[DELETE_COLUMN] Blocked deletion of protected column: Document Name');
                return;
            }

            // Get current state
            const currentColumns = stateRef.current.columns;
            console.log('[DELETE_COLUMN] Current columns:', currentColumns.map(c => `${c.label}(${c.id})`));

            // ✅ Multi-tier lookup for column to delete
            let columnToDelete = null;

            // 1. Exact label match
            columnToDelete = currentColumns.find(c => c.label === columnName);

            // 2. Case-insensitive label match
            if (!columnToDelete) {
                const lowerName = columnName.toLowerCase();
                columnToDelete = currentColumns.find(c => c.label?.toLowerCase() === lowerName);
                if (columnToDelete) {
                    logger.debug(`[DELETE_COLUMN] Found via case-insensitive match: ${columnToDelete.label}`);
                }
            }

            // 3. Check registry for registered ID
            if (!columnToDelete) {
                const registeredId = columnRegistryRef.current.get(columnName);
                if (registeredId) {
                    columnToDelete = currentColumns.find(c => c.id === registeredId);
                    if (columnToDelete) {
                        logger.debug(`[DELETE_COLUMN] Found via registry: ${registeredId}`);
                    }
                }
            }

            if (columnToDelete) {
                logger.important(`[DELETE_COLUMN] 🗑️ Deleting column: "${columnToDelete.label}" (id: ${columnToDelete.id})`);
                dispatch({
                    type: ActionTypes.DELETE_COLUMN,
                    columnId: columnToDelete.id
                });

                // Also remove from registry
                columnRegistryRef.current.delete(columnName);
                columnRegistryRef.current.delete(columnName.toLowerCase());
            } else {
                logger.warn(`[DELETE_COLUMN] Column not found: "${columnName}"`);
                logger.warn('[DELETE_COLUMN] Available columns:', currentColumns.map(c => c.label));
            }
        };

        const handleProcessingStep = (data) => {
            logger.debug('Step:', data.step);

            // Handle thinking indicator
            if (['analyzing', 'planning', 'searching'].includes(data.step)) {
                setIsThinking(true);
                setThinkingMessage(data.message || 'Processing...');
            } else {
                setIsThinking(false);
            }
        };

        const handleChatTyping = (data) => {
            setIsChatTyping(data.is_typing);
        };

        const handleExtractionResponse = (data) => {
            setIsThinking(false);

            const messageContent = data.response || '';
            const now = Date.now();

            // ✅ ROBUST DEDUPE: Check if this EXACT content was added in last 10 seconds
            // This prevents duplicates from:
            // 1. Backend sending message twice
            // 2. React StrictMode double-rendering
            // 3. WebSocket reconnection replays
            if (messageContent === lastMessageContentRef.current &&
                (now - lastMessageTimeRef.current) < 10000) {
                logger.debug('[EXTRACTION_RESPONSE] ⛔ Skipping duplicate (same content within 10s)');
                console.log('[DEDUPE] Blocked duplicate message:', messageContent.slice(0, 50));
                return;
            }

            // Update refs BEFORE adding to state
            lastMessageContentRef.current = messageContent;
            lastMessageTimeRef.current = now;

            const messageId = now;

            // Add Assistant Message
            setChatMessages(prev => {
                // Extra safety: check if last message has same content
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === messageContent) {
                    logger.debug('[EXTRACTION_RESPONSE] Last message in state identical, skipping');
                    return prev;
                }

                console.log('[EXTRACTION_RESPONSE] ✅ Adding new message:', messageContent.slice(0, 50));
                return [...prev, {
                    id: messageId,
                    role: 'assistant',
                    content: messageContent,
                    sources: data.sources,
                    confidence: data.confidence,
                    extracted_fields: data.extracted_fields
                }];
            });
        };

        const handleStreamRowData = (msg) => {
            try {
                const data = msg.data || msg; // Handle both wrapped and direct formats

                // ✅ DEBUG: Log every streamRowData message with FULL details
                console.log('[STREAM_DEBUG] Received streamRowData:', {
                    column_name: data.column_name,
                    file_name: data.file_name,
                    row_index: data.row_index,
                    extracted_value: data.extracted_value?.substring?.(0, 50) || data.extracted_value,
                    hasReasoning: !!data.reasoning,
                    hasCitations: !!(data.citations && data.citations.length > 0),
                    badge: data.badge
                });
                console.log('[STREAM_DEBUG] Full reasoning:', data.reasoning?.substring?.(0, 200) || '(none)');
                console.log('[STREAM_DEBUG] Citations count:', data.citations?.length || 0);

                // Three-tier column lookup
                let colId = columnRegistryRef.current.get(data.column_name) ||
                    stateRef.current.columns.find(c => c.label === data.column_name)?.id ||
                    data.column_id;

                if (!colId) {
                    // ✅ FIX: Multi-tier fuzzy matching for column names
                    const lowerName = data.column_name?.toLowerCase();
                    const columns = stateRef.current.columns;

                    // Tier 1: Case-insensitive exact match
                    let existingCol = columns.find(c => c.label?.toLowerCase() === lowerName);

                    if (!existingCol && lowerName) {
                        existingCol = columns.find(c => c.label?.toLowerCase().startsWith(lowerName));
                        if (existingCol) {
                            logger.debug(`[STREAM] Found column by startsWith: '${data.column_name}' matches '${existingCol.label}'`);
                        }
                    }

                    // Tier 3: Column label startsWith incoming name (reverse)
                    if (!existingCol && lowerName) {
                        existingCol = columns.find(c => lowerName.startsWith(c.label?.toLowerCase()));
                        if (existingCol) {
                            logger.debug(`[STREAM] Found column by reverse startsWith: '${existingCol.label}' is prefix of '${data.column_name}'`);
                        }
                    }

                    // Tier 4: includes match (last resort)
                    if (!existingCol && lowerName) {
                        existingCol = columns.find(c =>
                            c.label?.toLowerCase().includes(lowerName) ||
                            lowerName.includes(c.label?.toLowerCase())
                        );
                        if (existingCol) {
                            logger.debug(`[STREAM] Found column by includes: '${data.column_name}' ~ '${existingCol.label}'`);
                        }
                    }

                    if (existingCol) {
                        colId = existingCol.id;
                        // Register in columnRegistry for future lookups
                        columnRegistryRef.current.set(data.column_name, colId);
                        logger.debug(`[STREAM] Found existing column by fuzzy match: ${data.column_name} -> ${colId}`);
                    } else {
                        logger.warn(`[STREAM] No colId for column_name: ${data.column_name}. Attempting LAZY CREATION...`);

                        // ✅ LAZY CREATION / RECOVERY STRATEGY
                        // If backend streams data but we missed the create_column event (or it wasn't sent),
                        // we CREATE IT NOW using the same logic.
                        // This ensures robust data rendering even if messages arrive out of order.

                        colId = handleCreateColumn({
                            column_name: data.column_name,
                            column_type: "text" // Default to text if unknown, can be refined later
                        });

                        if (!colId) {
                            logger.error(`[STREAM] FAILED to lazily create column: ${data.column_name}. Dropping data.`);
                            return;
                        }

                        logger.important(`[STREAM] Successfully lazily created column: ${data.column_name} (id: ${colId})`);
                    }
                }

                const rowIndex = data.row_index;
                const normalizeName = (value) => String(value || '')
                    .replace(/^[a-f0-9-]+_/i, '')
                    .toLowerCase()
                    .trim();
                const rowMatchesFile = (candidateRowIndex) => {
                    if (typeof candidateRowIndex !== 'number') return false;
                    const row = stateRef.current.data[candidateRowIndex];
                    if (!row || !data.file_name) return false;
                    const docCol = stateRef.current.columns.find(c =>
                        c.label === 'Document Name' || c.dataType === DataTypes.FILE
                    );
                    const docColId = docCol ? docCol.id : 'Document Name';
                    const rawDocName = row[docColId] || row['Document Name'] || '';
                    const docName = typeof rawDocName === 'object'
                        ? (rawDocName.value || rawDocName.text || '')
                        : rawDocName;
                    const normalizedDoc = normalizeName(docName);
                    const normalizedFile = normalizeName(data.file_name);
                    return !!normalizedDoc && !!normalizedFile &&
                        (normalizedDoc === normalizedFile ||
                            normalizedDoc.includes(normalizedFile) ||
                            normalizedFile.includes(normalizedDoc));
                };

                // [FIX] Robust Row Index - only trust backend row_index if it matches the file row.
                // Uses multi-strategy matching for filenames
                let targetRowIndex = rowMatchesFile(rowIndex) ? rowIndex : undefined;

                // ✅ DEBUG: Log row resolution attempt
                console.log(`[ROW_RESOLVE] Starting resolution for file: "${data.file_name}", backend row_index: ${data.row_index}`);
                console.log(`[ROW_RESOLVE] fileRowMapRef has ${fileRowMapRef.current.size} entries:`, Array.from(fileRowMapRef.current.entries()));
                console.log(`[ROW_RESOLVE] Table has ${stateRef.current.data.length} rows`);

                if (targetRowIndex === undefined || targetRowIndex === null) {
                    const searchFileName = data.file_name || '';
                    const normalizedSearch = searchFileName.replace(/^[a-f0-9-]+_/i, '').toLowerCase().trim();
                    console.log(`[ROW_RESOLVE] Searching for normalized: "${normalizedSearch}"`);

                    // Strategy 1: Exact match in fileRowMapRef
                    if (fileRowMapRef.current.has(searchFileName)) {
                        targetRowIndex = fileRowMapRef.current.get(searchFileName);
                        logger.debug(`[STREAM] Found row ${targetRowIndex} via exact map match`);
                    } else {
                        // Strategy 2: Fuzzy match in fileRowMapRef
                        for (const [mapKey, mapRowIndex] of fileRowMapRef.current.entries()) {
                            const normalizedMapKey = mapKey.replace(/^[a-f0-9-]+_/i, '').toLowerCase().trim();

                            if (normalizedMapKey === normalizedSearch ||
                                mapKey.toLowerCase().includes(searchFileName.toLowerCase()) ||
                                searchFileName.toLowerCase().includes(normalizedMapKey)) {
                                targetRowIndex = mapRowIndex;
                                logger.debug(`[STREAM] Found row ${targetRowIndex} via fuzzy map match`);
                                break;
                            }
                        }
                    }

                    // Strategy 3: FALLBACK - Search table data directly for Document Name
                    if (targetRowIndex === undefined || targetRowIndex === null) {
                        const docCol = stateRef.current.columns.find(c =>
                            c.label === 'Document Name' || c.dataType === DataTypes.FILE
                        );
                        const docColId = docCol ? docCol.id : 'Document Name';

                        for (let rowIdx = 0; rowIdx < stateRef.current.data.length; rowIdx++) {
                            const row = stateRef.current.data[rowIdx];
                            const rawDocName = row[docColId] || row['Document Name'] || '';
                            let docName = rawDocName;
                            if (typeof rawDocName === 'object') {
                                docName = rawDocName.value || rawDocName.text || '';
                            }
                            if (!docName || typeof docName !== 'string') continue;

                            const normalizedDoc = docName.toLowerCase().trim();
                            if (normalizedDoc === normalizedSearch ||
                                normalizedDoc.includes(normalizedSearch) ||
                                normalizedSearch.includes(normalizedDoc)) {
                                targetRowIndex = rowIdx;
                                logger.info(`[STREAM] Found row ${rowIdx} via table data search: "${docName}" matches "${searchFileName}"`);
                                // Update fileRowMapRef for future lookups
                                fileRowMapRef.current.set(docName, rowIdx);
                                break;
                            }
                        }
                    }
                }

                if (targetRowIndex === undefined || targetRowIndex === null) {
                    // ✅ FALLBACK: Use row 0 if only one file exists
                    if (fileRowMapRef.current.size === 1) {
                        targetRowIndex = Array.from(fileRowMapRef.current.values())[0];
                        console.log(`[ROW_RESOLVE] ⚠️ Using single-file fallback: row ${targetRowIndex}`);
                        logger.warn(`[STREAM] Using single-file fallback for row index: ${targetRowIndex}`);
                    } else if (stateRef.current.data.length === 1) {
                        // Only one row in table, use it
                        targetRowIndex = 0;
                        console.log(`[ROW_RESOLVE] ⚠️ Using single-row fallback: row 0`);
                        logger.warn(`[STREAM] Using single-row fallback for row index: 0`);
                    } else {
                        console.log(`[ROW_RESOLVE] ❌ FAILED! Dropping data for file: "${data.file_name}"`);
                        console.log(`[ROW_RESOLVE] ❌ Map keys:`, Array.from(fileRowMapRef.current.keys()));
                        console.log(`[ROW_RESOLVE] ❌ Table rows:`, stateRef.current.data.length);
                        logger.error(`[STREAM] Could not resolve row for file: ${data.file_name}. Map has: ${Array.from(fileRowMapRef.current.keys()).join(', ')}`);
                        logger.error(`[STREAM] Table has ${stateRef.current.data.length} rows with document names.`);
                        return; // Skip this data point
                    }
                }

                console.log(`[ROW_RESOLVE] ✅ Final targetRowIndex: ${targetRowIndex} for file: "${data.file_name}"`);


                // Auto-expand rows if needed
                if (targetRowIndex !== undefined && targetRowIndex >= stateRef.current.data.length) {
                    dispatch({
                        type: ActionTypes.ADD_ROWS,
                        count: targetRowIndex - stateRef.current.data.length + 1
                    });
                }

                // Update cell with extracted value - pass STRUCTURED CELL DATA
                if (targetRowIndex !== undefined) {
                    // ✅ FIX: Handle case where extracted_value is an object (not a string)
                    let extractedValue = data.extracted_value || data.value || '';
                    if (typeof extractedValue === 'object' && extractedValue !== null) {
                        // If it's an object, try to extract the 'value' key, or stringify
                        if (extractedValue.value !== undefined) {
                            extractedValue = extractedValue.value;
                        } else if (extractedValue.content !== undefined) {
                            extractedValue = extractedValue.content;
                        } else {
                            // Last resort: stringify
                            extractedValue = JSON.stringify(extractedValue);
                        }
                    }
                    // Ensure it's always a string
                    if (typeof extractedValue !== 'string') {
                        extractedValue = String(extractedValue);
                    }

                    // ✅ FIX: Pass full structured cell object with reasoning, citations, badge
                    const structuredValue = {
                        value: extractedValue,
                        citations: data.citations || [],
                        reasoning: data.reasoning || null,
                        badge: data.badge || null
                    };


                    // ✅ DEBUG: Log every UPDATE_CELL dispatch with FULL structured value
                    console.log(`[UPDATE_CELL] 📝 Dispatching:`, {
                        rowIndex: targetRowIndex,
                        columnId: colId,
                        columnName: data.column_name,
                        value: structuredValue.value?.substring?.(0, 50) || structuredValue.value,
                        hasReasoning: !!structuredValue.reasoning,
                        reasoningLength: structuredValue.reasoning?.length || 0,
                        citationsCount: structuredValue.citations?.length || 0,
                        badge: structuredValue.badge
                    });

                    dispatch({
                        type: ActionTypes.UPDATE_CELL,
                        rowIndex: targetRowIndex,
                        columnId: colId,
                        value: structuredValue
                    });

                    // Track updating animation
                    setUpdatingColumns(prev => {
                        const newSet = new Set(prev);
                        newSet.add(colId);
                        return newSet;
                    });

                    logger.debug(`[STREAM] Updated row ${targetRowIndex}, col ${colId}`);
                }


            } catch (error) {
                logger.error('[STREAM] Error:', error);
            }
        };

        const handleExtractionComplete = (data) => {
            logger.debug('[EXTRACTION_COMPLETE] Clearing all column animations');
            isStreamingRef.current = false; // [COMMENT 1] Mark streaming complete
            setUpdatingColumns(new Set()); // Clear all animations immediately
            setIsThinking(false); // ✅ FIX: Clear thinking state
            setIsChatTyping(false); // ✅ FIX: Clear typing indicator

            // ✅ FIX: Clear any pending thinking message intervals
            if (window.currentQueryInterval) {
                clearInterval(window.currentQueryInterval);
                window.currentQueryInterval = null;
            }
        };

        // ✅ NEW: Handle extraction stopped by user
        const handleExtractionStopped = (data) => {
            logger.important('[EXTRACTION_STOPPED] User stopped the extraction', data);
            isStreamingRef.current = false;
            setUpdatingColumns(new Set()); // Clear all animations
            setIsThinking(false);
            setIsChatTyping(false);

            // Clear pending animation targets
            pendingAnimationTargetsRef.current = null;

            // Clear any pending intervals
            if (window.currentQueryInterval) {
                clearInterval(window.currentQueryInterval);
                window.currentQueryInterval = null;
            }

            // ✅ CRITICAL: Clear all "Extracting..." placeholders immediately
            const currentState = stateRef.current;
            if (currentState && currentState.data) {
                currentState.data.forEach((row, rowIndex) => {
                    if (!row) return;
                    Object.keys(row).forEach(colId => {
                        const cellValue = row[colId];
                        const isPlaceholder =
                            cellValue === 'Extracting...' ||
                            (cellValue && typeof cellValue === 'object' && (
                                cellValue.text === 'Extracting...' ||
                                cellValue.value === 'Extracting...' ||
                                cellValue.is_placeholder === true ||
                                cellValue.isPlaceholder === true
                            ));

                        if (isPlaceholder) {
                            dispatch({
                                type: ActionTypes.UPDATE_CELL,
                                rowIndex,
                                columnId: colId,
                                value: '' // Clear to empty on cancel
                            });
                        }
                    });
                });
            }

            // Add system message about stop
            setChatMessages(prev => [...prev, {
                id: Date.now(),
                role: 'system',
                content: data.message || 'Extraction stopped by user.'
            }]);
        };

        const handleDataStreamingComplete = (data) => {
            logger.important('[DATA_STREAMING_COMPLETE] Final cleanup triggered', data);
            isStreamingRef.current = false;
            setUpdatingColumns(new Set());
            setIsThinking(false);
            setIsChatTyping(false);

            // Clear pending animation targets to prevent stale targets
            pendingAnimationTargetsRef.current = null;

            if (window.currentQueryInterval) {
                clearInterval(window.currentQueryInterval);
                window.currentQueryInterval = null;
            }

            // [FIX] Add dwell time to allow late-arriving data to settle
            // This prevents race condition where cleanup clears cells before data arrives
            const MIN_DWELL_TIME_MS = 3000;  // 3 seconds to let late data arrive

            setTimeout(() => {
                // Double-check streaming is still complete
                if (isStreamingRef.current) {
                    logger.debug('[CLEANUP] Streaming resumed, skipping cleanup');
                    return;
                }

                const currentState = stateRef.current;
                let stuckCount = 0;

                if (!currentState || !currentState.data) {
                    logger.warn('[CLEANUP] State invalid or empty, skipping');
                    return;
                }

                currentState.data.forEach((row, rowIndex) => {
                    if (!row) return; // Guard against empty rows

                    Object.keys(row).forEach(colId => {
                        const cellValue = row[colId];
                        // Strict check for placeholders - covers all formats:
                        // 1. String: 'Extracting...'
                        // 2. Object: { text: 'Extracting...' } or { value: 'Extracting...' }
                        // 3. Placeholder flags: is_placeholder or isPlaceholder
                        const isStuck =
                            cellValue === 'Extracting...' ||
                            (cellValue && typeof cellValue === 'object' && (
                                cellValue.text === 'Extracting...' ||
                                cellValue.value === 'Extracting...' ||
                                cellValue.is_placeholder === true ||
                                cellValue.isPlaceholder === true
                            ));

                        if (isStuck) {
                            stuckCount++;
                            // Set to "N/A" with explanation instead of empty - prevents "vanishing data" appearance
                            dispatch({
                                type: ActionTypes.UPDATE_CELL,
                                rowIndex,
                                columnId: colId,
                                value: { value: 'N/A', citations: [], reasoning: 'Extraction incomplete or timed out' }
                            });
                            // Also remove from map just in case
                            const docName = row['Document Name'] || 'Unknown';
                            const cellKey = `${docName}:${colId}`;
                            placeholderAgesRef.current.delete(cellKey);
                        }
                    });
                });

                if (stuckCount > 0) {
                    logger.important(`[CLEANUP] Forcefully cleared ${stuckCount} stuck 'Extracting...' placeholders.`);
                } else {
                    logger.debug('[CLEANUP] No stuck placeholders found.');
                }
            }, 500);
        };

        const handleClearUpdatingState = (data) => {
            logger.debug('[CLEAR_UPDATING_STATE] Clearing animations and stuck placeholders');
            setUpdatingColumns(new Set());
            setIsThinking(false);
            setIsChatTyping(false);

            // Clear any pending thinking message intervals
            if (window.currentQueryInterval) {
                clearInterval(window.currentQueryInterval);
                window.currentQueryInterval = null;
            }

            // ✅ CRITICAL FIX: Delay the placeholder check to allow React state to settle
            // This prevents race condition where UPDATE_CELL dispatch hasn't been processed yet
            setTimeout(() => {
                // ✅ CRITICAL FIX: Also clear stuck "Extracting..." values in cells
                const currentState = stateRef.current;
                if (currentState && currentState.data && currentState.columns) {
                    let clearedCount = 0;
                    currentState.data.forEach((row, rowIndex) => {
                        if (!row) return;
                        currentState.columns.forEach(col => {
                            if (!col || !col.id) return;
                            const cellValue = row[col.id];
                            // Check if cell is still showing "Extracting..." - covers all formats:
                            // 1. String: 'Extracting...'
                            // 2. Object with .text: { text: 'Extracting...' }
                            // 3. Object with .value: { value: 'Extracting...', isPlaceholder: true }
                            const isStuck =
                                (typeof cellValue === 'string' && cellValue.trim() === 'Extracting...') ||
                                (typeof cellValue === 'object' && cellValue?.text === 'Extracting...') ||
                                (typeof cellValue === 'object' && cellValue?.value === 'Extracting...') ||
                                (typeof cellValue === 'object' && cellValue?.isPlaceholder === true);

                            if (isStuck) {
                                dispatch({
                                    type: ActionTypes.UPDATE_CELL,
                                    rowIndex,
                                    columnId: col.id,
                                    value: '' // Clear to empty
                                });
                                clearedCount++;
                            }
                        });
                    });
                    if (clearedCount > 0) {
                        logger.important(`[CLEAR_UPDATING_STATE] Cleared ${clearedCount} stuck placeholders`);
                    }
                }

                logger.info('✅ Cleared all updating states and placeholders');
            }, 200); // ✅ Wait 200ms for React state to settle after UPDATE_CELL dispatch
        };

        const handleIndexingComplete = (data) => {
            logger.important('✅ Indexing complete:', data);
            setUploadStatus('complete');
            setExtractionStatus('ready_for_extraction');

            // Force 100% progress
            setFileProgress(prev => prev.map(f => ({ ...f, status: 'indexed', progress: 100 })));

            // ✅ CRITICAL RECONCILIATION: Create rows for uploaded files (Comment 3)
            if (data.uploaded_files && data.uploaded_files.length > 0) {

                // 1. Resolve Document Name Column ID
                const docCol = stateRef.current.columns.find(c => c.label === 'Document Name' || c.dataType === DataTypes.FILE);
                const docColId = docCol ? docCol.id : 'Document Name';

                // 2. Identify missing files
                // We check if file is already in fileRowMapRef (which is auto-synced via App.jsx useEffect)
                const missingFiles = [];
                data.uploaded_files.forEach(file => {
                    const normalizedName = file.display_name || file.filename || file.name;
                    const nameKey = String(normalizedName).trim();
                    const isMapped = fileRowMapRef.current.has(nameKey);

                    if (!isMapped) {
                        missingFiles.push(file);
                    }
                });

                // 4. Create rows ONLY for missing files
                if (missingFiles.length > 0) {
                    logger.debug(`[indexingComplete] Creating ${missingFiles.length} missing rows`);

                    const newRows = missingFiles.map(file => ({
                        [docColId]: file.display_name || file.filename || file.name
                    }));

                    dispatch({
                        type: ActionTypes.ADD_MULTIPLE_ROWS,
                        rows: newRows
                    });

                    // Note: fileRowMapRef will be updated automatically by App.jsx useEffect
                } else {
                    logger.debug('[indexingComplete] All files already have rows. Skipping creation.');
                }
            } else {
                // Fallback: Create default 20 rows if no file info AND table is empty
                if (stateRef.current.data.length === 0) {
                    logger.debug('[indexingComplete] No file info & empty table, creating 20 default rows');
                    const defaultRows = Array.from({ length: 20 }, () => ({}));
                    dispatch({
                        type: ActionTypes.ADD_MULTIPLE_ROWS,
                        rows: defaultRows
                    });
                }
            }

            // Sync file rows
            // We ensure that for every file, there corresponds a row in the table
            const currentFiles = stateRef.current.data.map(r => r['Document Name']);
            // logger.debug('[WS] Current table files:', currentFiles);

            // ✅ FIX: Navigate to table view (sidebar) after indexing is done
            if (setCurrentPage) {
                // [COMMENT 2] Guard navigation to avoid disrupting user
                // Only redirect if we are on upload/loading pages, NOT if already on sidebar
                const safePages = ['upload', 'loading', 'processing', undefined, null];
                if (safePages.includes(currentPage)) {
                    logger.debug('[WS] Indexing complete, switching to sidebar view (table)');
                    setCurrentPage('sidebar');  // Go to sidebar/table view, not chat
                } else {
                    logger.debug(`[WS] Indexing complete but user is on '${currentPage}', skipping auto-nav`);
                }
            } else {
                logger.warn('[WS] setCurrentPage NOT available, cannot switch view');
            }

            // ✅ FIX: Set upload status to complete when indexing is done
            // This resets the pause button in sidebar after file is fully processed
            setUploadStatus('complete');
            setTimeout(() => setUploadStatus('idle'), 2000);

            // ✅ FIX: Do NOT create a second WebSocket connection here!
            // The websocketService is already connected and has all listeners registered.
            // Creating a second connection via chatWebsocketService causes the backend to
            // route messages to the new connection, which has NO listeners.
            // If heartbeat is needed, use websocketService.startHeartbeat() instead.
            logger.debug('[WS] Indexing complete - reusing existing websocketService connection');
        };

        // ✅ NEW: Smart Animation Targeting
        // Backend sends this BEFORE extraction to tell us exactly which rows/columns to animate
        const handleExtractionTargeting = (data) => {
            const { target_files, target_columns } = data;
            logger.info(`[WS] 🎯 extraction_targeting received: files=${JSON.stringify(target_files)}, columns=${JSON.stringify(target_columns)}`);

            // ✅ CRITICAL FIX: Reset claimed columns from PREVIOUS extraction
            // This prevents old claims from blocking new columns at correct indices
            claimedColumnsRef.current.clear();
            logger.info(`[WS] 🔄 Cleared claimed columns for new extraction`);


            // Resolve which row indices to animate based on file names
            const rowIndices = [];
            const docCol = stateRef.current.columns.find(c => c.label === 'Document Name' || c.dataType === DataTypes.FILE);
            const docColId = docCol ? docCol.id : 'Document Name';

            if (Array.isArray(target_files)) {
                // Specific files by name - simple partial match against Document Name column
                // Trust LLM to provide correct filenames - no hardcoded company name logic
                stateRef.current.data.forEach((row, idx) => {
                    const rawDocName = row[docColId] || row['Document Name'] || '';
                    // Handle both string and object formats
                    let rowDocName = rawDocName;
                    if (rawDocName && typeof rawDocName === 'object') {
                        rowDocName = rawDocName.value || rawDocName.text || '';
                    }
                    if (!rowDocName || typeof rowDocName !== 'string') return;

                    // Simple case-insensitive partial match - LLM provides the exact filenames
                    const matches = target_files.some(tf => {
                        if (!tf) return false;
                        const tfLower = tf.toLowerCase();
                        const rowLower = rowDocName.toLowerCase();
                        return rowLower.includes(tfLower) || tfLower.includes(rowLower);
                    });
                    if (matches) {
                        rowIndices.push(idx);
                        logger.debug(`[TARGETING] Row ${idx} matched: "${rowDocName}"`);
                    }
                });
                logger.info(`[TARGETING] target_files (array) resolved to ${rowIndices.length} rows`);
            } else if (target_files === 'all') {
                // All rows with a REAL document name (not empty)
                stateRef.current.data.forEach((row, idx) => {
                    const rawDocName = row[docColId] || row['Document Name'];
                    // ✅ FIX: Handle both string and object formats (e.g., {value: 'filename'})
                    let docName = rawDocName;
                    if (rawDocName && typeof rawDocName === 'object') {
                        docName = rawDocName.value || rawDocName.text || '';
                    }
                    // Strict check - must be non-empty string
                    const hasDocument = docName &&
                        typeof docName === 'string' &&
                        docName.trim() !== '' &&
                        !docName.includes('Extracting');
                    if (hasDocument) {
                        rowIndices.push(idx);
                        logger.debug(`[TARGETING] Row ${idx} has document: "${docName}"`);
                    }
                });
                logger.info(`[TARGETING] target_files='all' resolved to ${rowIndices.length} rows with documents`);
            } else if (target_files === 'new') {
                // "new" = last row with a REAL document name
                console.log('[TARGETING] Looking for "new" file. Table has', stateRef.current.data.length, 'rows');
                for (let i = stateRef.current.data.length - 1; i >= 0; i--) {
                    const row = stateRef.current.data[i];
                    const rawDocName = row[docColId] || row['Document Name'];
                    let docName = rawDocName;
                    if (rawDocName && typeof rawDocName === 'object') {
                        docName = rawDocName.value || rawDocName.text || '';
                    }
                    console.log(`[TARGETING] Row ${i}: docName="${docName}"`);
                    const hasDocument = docName &&
                        typeof docName === 'string' &&
                        docName.trim() !== '' &&
                        !docName.includes('Extracting');
                    if (hasDocument) {
                        rowIndices.push(i);
                        console.log(`[TARGETING] ✅ target_files='new' resolved to row ${i}: "${docName}"`);
                        logger.info(`[TARGETING] target_files='new' resolved to row ${i}: "${docName}"`);
                        break;
                    }
                }
                if (rowIndices.length === 0) {
                    console.log('[TARGETING] ⚠️ Could not find any row for new file!');
                }
            }

            // Resolve which column IDs to animate
            let columnIds = [];
            let pendingColumnNames = [];

            if (target_columns === 'all') {
                // All non-system columns (existing ones)
                const systemCols = ['selection', 'Document Name', 'add_column'];
                columnIds = stateRef.current.columns
                    .filter(c => !systemCols.includes(c.label) && !systemCols.includes(c.id))
                    .map(c => c.id);
                // Also mark as pending so any NEW columns get animation too
                pendingColumnNames = ['__ALL__']; // Special marker for "all future columns"
            } else if (target_columns === 'new') {
                // Columns that don't have data yet (will be created by extraction)
                pendingColumnNames = ['__NEW__']; // Special marker for newly created columns
            } else if (Array.isArray(target_columns)) {
                // Specific columns by name - check which exist and which are pending
                target_columns.forEach(colName => {
                    const existingCol = stateRef.current.columns.find(
                        c => c.label === colName || c.id === colName
                    );
                    if (existingCol) {
                        columnIds.push(existingCol.id);
                    } else {
                        // Column doesn't exist yet - store for later
                        pendingColumnNames.push(colName);
                    }
                });
            }

            logger.info(`[WS] 🎯 Resolved targets: rows=${rowIndices}, existing columns=${columnIds.length}, pending columns=${pendingColumnNames.length}`);
            console.log('[TARGETING] Row indices:', rowIndices);
            console.log('[TARGETING] Column IDs:', columnIds);
            console.log('[TARGETING] Pending column names:', pendingColumnNames);

            // Store pending animation targets for when columns are created
            if (pendingColumnNames.length > 0 || rowIndices.length > 0) {
                pendingAnimationTargetsRef.current = {
                    rowIndices,
                    columnNames: pendingColumnNames,
                    allColumns: pendingColumnNames.includes('__ALL__'),
                    newColumns: pendingColumnNames.includes('__NEW__')
                };
                logger.info(`[WS] 📌 Stored pending animation targets: ${JSON.stringify(pendingAnimationTargetsRef.current)}`);
            }

            // Dispatch immediately for any existing columns
            if (columnIds.length > 0 && rowIndices.length > 0) {
                console.log('[TARGETING] ✅ DISPATCHING SET_EXTRACTING_CELLS for', rowIndices.length, 'rows and', columnIds.length, 'columns');
                dispatch({
                    type: ActionTypes.SET_EXTRACTING_CELLS,
                    rowIndices,
                    columnIds
                });
            }
        };

        // --- Register Listeners ---
        console.log(`[WS_HOOK] 🔌 REGISTERING LISTENERS for session: ${sessionId}`);

        websocketService.on('welcome', handleWelcome);
        websocketService.on('upload_progress', handleUploadProgress);
        websocketService.on('upload_complete', handleUploadComplete);
        websocketService.on('files_stored', handleFilesStored);
        websocketService.on('create_column', handleCreateColumn);
        websocketService.on('rename_column', handleRenameColumn);  // ✅ NEW: Handle column rename
        websocketService.on('delete_column', handleDeleteColumn);  // ✅ NEW: Handle column delete
        websocketService.on('process_step', handleProcessingStep);
        websocketService.on('chat_typing', handleChatTyping);
        websocketService.on('extraction_query_response', handleExtractionResponse);
        websocketService.on('streamRowData', handleStreamRowData);
        websocketService.on('extraction_complete', handleExtractionComplete);
        websocketService.on('extraction_stopped', handleExtractionStopped);  // ✅ NEW: Handle stop
        websocketService.on('data_streaming_complete', handleDataStreamingComplete);
        websocketService.on('clear_updating_state', handleClearUpdatingState);
        websocketService.on('indexingComplete', handleIndexingComplete);
        websocketService.on('extraction_targeting', handleExtractionTargeting);  // ✅ NEW: Smart animation targeting

        // Error handling
        websocketService.on('error', (data) => {
            logger.error('WS Error:', data);
            setChatMessages(prev => [...prev, {
                id: Date.now(),
                role: 'assistant',
                isError: true,
                content: `Error: ${data.message || 'Unknown error occurred'}`
            }]);
            setIsThinking(false);
        });

        return () => {
            // Cleanup listeners
            console.log(`[WS_HOOK] 🧹 CLEANING UP LISTENERS for session: ${sessionId}`);
            websocketService.off('welcome', handleWelcome);
            websocketService.off('upload_progress', handleUploadProgress);
            websocketService.off('upload_complete', handleUploadComplete);
            websocketService.off('files_stored', handleFilesStored);
            websocketService.off('create_column', handleCreateColumn);
            websocketService.off('delete_column', handleDeleteColumn);  // ✅ NEW: Cleanup
            websocketService.off('process_step', handleProcessingStep);
            websocketService.off('chat_typing', handleChatTyping);
            websocketService.off('extraction_query_response', handleExtractionResponse);
            websocketService.off('streamRowData', handleStreamRowData);
            websocketService.off('extraction_complete', handleExtractionComplete);
            websocketService.off('extraction_stopped', handleExtractionStopped);  // ✅ NEW: Cleanup
            websocketService.off('data_streaming_complete', handleDataStreamingComplete);
            websocketService.off('clear_updating_state', handleClearUpdatingState);
            websocketService.off('indexingComplete', handleIndexingComplete);
            websocketService.off('extraction_targeting', handleExtractionTargeting);  // ✅ NEW: Cleanup
            websocketService.off('error');

            // ✅ NEW: Cleanup chat WebSocket
            chatWebsocketService.removeHeartbeat();
            chatWebsocketService.disconnect();
        };

    }, [sessionId, dispatch, stateRef]);
};
