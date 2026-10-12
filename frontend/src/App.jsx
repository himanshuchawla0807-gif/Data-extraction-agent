import React, { useEffect, useReducer, useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import './style.css';
import './animations.css'; // ✅ Import animations

import FileUploadPage from './pages/FileUploadPage';
import ErrorBoundary from './components/ErrorBoundary';
import { AIChatInput } from './components/AIChatInput';
import { AILoader } from './components/AILoader';
import ThinkingIndicator from './components/ThinkingIndicator';
import TypingText from './components/TypingText';
import { ResizableSidebar } from './components/ResizableSidebar';
import Sidebar from './Sidebar'; // ✅ NEW: Import new chat-focused Sidebar
import SourceViewer from './components/SourceViewer'; // ✅ NEW: Source Viewer
const PDFViewer = lazy(() => import('./components/PDFViewer'));
import { SourceViewerContext } from './AppContext'; // ✅ NEW: Context
import websocketService from './services/websocket';
import chatWebsocketService from './services/chatWebsocket';
import apiService from './services/api';
// ✅ NEW: Firebase Auth Import
import { auth } from './utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';

import {
  randomColor,
  shortId,
  ActionTypes,
  DataTypes,
  Constants,
  downloadAsCSV,
  downloadAsPDF,
  downloadAsExcel,
} from './utils';


import update from 'immutability-helper';

// Hooks & Utils
import { useExtractionWebSocket } from './hooks/useExtractionWebSocket';
import logger from './utils/logger';
import TableV8 from './TableV8'; // ✅ V8 Import
import { refineColumn } from './utils/refineColumn'; // ✅ Pure function
import { API_BASE_URL, getWsUrl } from './config'; // ✅ Production API config

// ✅ NEW: Session Service for Firestore persistence
const SESSION_SERVICE_URL = import.meta.env.VITE_SESSION_SERVICE_URL || 'http://localhost:8101/api';
const AGENT_TYPE = 'data_extraction';

// ✅ NEW: Save chat message to Firestore via session-service
const saveMessageToFirestore = async (userId, sessionId, role, content) => {
  if (!userId || !sessionId || !content) {
    console.warn('[SAVE_MESSAGE] Missing required params, skipping save');
    return false;
  }

  try {
    const response = await fetch(`${SESSION_SERVICE_URL}/sessions/${userId}/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
      },
      body: JSON.stringify({
        role: role,  // 'user' or 'assistant'
        content: content
      })
    });

    if (response.ok) {
      console.log(`[SAVE_MESSAGE] ✅ Saved ${role} message to Firestore`);
      return true;
    } else {
      console.warn('[SAVE_MESSAGE] ❌ Failed:', response.status);
      return false;
    }
  } catch (error) {
    console.warn('[SAVE_MESSAGE] ❌ Error:', error);
    return false;
  }
};

// ✅ NEW: Save table state to Firestore via session-service
const saveTableStateToFirestore = async (userId, sessionId, columns, data, chatTitle) => {
  if (!userId || !sessionId) {
    console.warn('[SAVE_TABLE] Missing userId or sessionId, skipping save');
    return false;
  }

  try {
    // Filter out the "+" add column button and prepare columns for save
    const columnsToSave = columns
      .filter(col => col.id !== Constants.ADD_COLUMN_ID && col.label !== '+')
      .map(col => ({
        id: col.id,
        label: col.label,
        dataType: col.dataType || 'text'
      }));

    // Prepare row data - convert to label-keyed format for portability
    const dataToSave = data.map(row => {
      const savedRow = {};
      columnsToSave.forEach(col => {
        const cellValue = row[col.id];
        if (cellValue !== undefined && cellValue !== null && cellValue !== '') {
          savedRow[col.label] = cellValue;
        }
      });
      return savedRow;
    });

    const response = await fetch(`${SESSION_SERVICE_URL}/sessions/${userId}/${sessionId}/table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
      },
      body: JSON.stringify({
        columns: columnsToSave,
        data: dataToSave,
        chatTitle: chatTitle
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[SAVE_TABLE] ✅ Saved to Firestore: ${result.columnCount} cols, ${result.rowCount} rows`);
      return true;
    } else {
      console.error('[SAVE_TABLE] ❌ Failed:', response.status);
      return false;
    }
  } catch (error) {
    console.error('[SAVE_TABLE] ❌ Error:', error);
    return false;
  }
};

// ✅ EXPOSE FOR TESTING
if (typeof window !== 'undefined') {
  window.websocketService = websocketService;
}

// FEATURE FLAG

// ✅ TEST FUNCTION (Temporary)
if (typeof window !== 'undefined') {
  window.runLazyTest = () => {
    const testColName = "LazyRev_" + Date.now().toString().slice(-4);
    console.log("🚀 Running Lazy Test for:", testColName);

    if (window.websocketService) {
      window.websocketService.emit('streamRowData', {
        type: 'streamRowData',
        data: {
          column_name: testColName,
          extracted_value: "$999K",
          row_index: 0,
          file_name: "Test.pdf",
          is_placeholder: false
        }
      });
      alert(`Test Data Sent! Look for column "${testColName}" with value "$999K".`);
    } else {
      alert("Error: Websocket Service not found.");
    }
  };
}

function reducer(state, action) {
  switch (action.type) {
    case ActionTypes.ADD_OPTION_TO_COLUMN:
      {
const optionIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      return update(state, {
        skipReset: { $set: true },
        columns: {
          [optionIndex]: {
            options: {
              $push: [
                {
                  label: action.option,
                  backgroundColor: action.backgroundColor,
                },
              ],
            },
          },
        },
      });
}
    case ActionTypes.ADD_ROW:
      // FIXED: Use action.rowData if provided, otherwise empty object
      {
const newRowData = action.rowData || {};
      console.log('[REDUCER] ADD_ROW with data:', newRowData);
      return update(state, {
        skipReset: { $set: true },
        data: { $push: [newRowData] },
      });
}
    case ActionTypes.ADD_MULTIPLE_ROWS:
      return update(state, {
        skipReset: { $set: true },
        data: { $push: action.rows },
      });
    case ActionTypes.UPDATE_COLUMN_TYPE:
      {
const typeIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      switch (action.dataType) {
        case DataTypes.NUMBER:
          if (state.columns[typeIndex].dataType === DataTypes.NUMBER) {
            return state;
          } else {
            return update(state, {
              skipReset: { $set: true },
              columns: { [typeIndex]: { dataType: { $set: action.dataType } } },
              data: {
                $apply: data =>
                  data.map(row => {
                    const currentVal = row[action.columnId];
                    // ✅ FIX: Handle ID/Metadata objects - Convert safely to number
                    let numericVal;
                    let restProps = {};

                    if (currentVal && typeof currentVal === 'object') {
                      // Preserve metadata
                      restProps = { ...currentVal };
                      const rawVal = currentVal.value || currentVal.content || '';
                      numericVal = isNaN(rawVal) ? '' : Number.parseFloat(rawVal);
                      restProps.value = numericVal;
                    } else {
                      numericVal = isNaN(currentVal) ? '' : Number.parseFloat(currentVal);
                    }

                    return {
                      ...row,
                      [action.columnId]: typeof currentVal === 'object' ? restProps : numericVal,
                    };
                  }),
              },
            });
          }
        case DataTypes.SELECT:
          if (state.columns[typeIndex].dataType === DataTypes.SELECT) {
            return state;
          } else {
            let options = [];
            state.data.forEach(row => {
              const val = row[action.columnId];
              // ✅ FIX: Extract label from object if needed
              let label = val;
              if (val && typeof val === 'object') {
                label = val.value || val.content || '';
              }

              if (label) {
                options.push({
                  label: String(label),
                  backgroundColor: randomColor(),
                });
              }
            });
            return update(state, {
              skipReset: { $set: true },
              columns: {
                [typeIndex]: {
                  dataType: { $set: action.dataType },
                  options: { $push: options },
                },
              },
            });
          }
        case DataTypes.TEXT:
          if (state.columns[typeIndex].dataType === DataTypes.TEXT) {
            return state;
          } else if (state.columns[typeIndex].dataType === DataTypes.SELECT) {
            return update(state, {
              skipReset: { $set: true },
              columns: { [typeIndex]: { dataType: { $set: action.dataType } } },
            });
          } else {
            return update(state, {
              skipReset: { $set: true },
              columns: { [typeIndex]: { dataType: { $set: action.dataType } } },
              data: {
                $apply: data =>
                  data.map(row => {
                    const currentVal = row[action.columnId];
                    // ✅ FIX: Handle ID/Metadata objects - Convert safely to string
                    // DO NOT flatten objects to "[object Object]"

                    if (currentVal && typeof currentVal === 'object') {
                      // It's already an object (likely with value, citations, etc.)
                      // Just ensure the 'value' part is a string
                      const stringValue = String(currentVal.value || currentVal.content || '');
                      return {
                        ...row,
                        [action.columnId]: {
                          ...currentVal,
                          value: stringValue
                        }
                      };
                    }

                    return {
                      ...row,
                      [action.columnId]: String(currentVal || ''),
                    };
                  }),
              },
            });
          }
        case DataTypes.FILE:
          if (state.columns[typeIndex].dataType === DataTypes.FILE) {
            return state;
          } else {
            return update(state, {
              skipReset: { $set: true },
              columns: { [typeIndex]: { dataType: { $set: action.dataType } } },
            });
          }
        default:
          return state;
      }
}
    case ActionTypes.REFINE_COLUMN: // ✅ NEW Action for V8 support
      return update(state, {
        skipReset: { $set: true },
        columns: { $set: refineColumn(state.columns, action.columnId, action.options) }
      });
    case ActionTypes.UPDATE_COLUMN_HEADER:
      {
console.log(`[REDUCER] UPDATE_COLUMN_HEADER: Renaming`, action.columnId, `to "${action.label}"`);
      const index = state.columns.findIndex(
        column => column.id === action.columnId
      );
      if (index === -1) {
        console.log(`[REDUCER] ❌ UPDATE_COLUMN_HEADER: Column ${action.columnId} NOT FOUND in:`, state.columns.map(c => ({ id: c.id, label: c.label })));
        logger.error(`[REDUCER] UPDATE_COLUMN_HEADER: Column ${action.columnId} NOT FOUND!`);
        return state;
      }
      console.log(`[REDUCER] ✅ UPDATE_COLUMN_HEADER: Found column at index ${index}, renaming to "${action.label}"`);
      logger.important(`[REDUCER] Renaming Column ${action.columnId} (Index ${index}) to "${action.label}"`);
      return update(state, {
        skipReset: { $set: true },
        columns: { [index]: { label: { $set: action.label } } },
      });
}
    case ActionTypes.UPDATE_CELL:
      // ✅ CRITICAL FIX: Auto-expand table if rowIndex exceeds current data length
      if (action.rowIndex >= state.data.length) {
        logger.debug(`[UPDATE_CELL] Auto-expanding table from ${state.data.length} to ${action.rowIndex + 1} rows`);

        const rowsToAdd = action.rowIndex - state.data.length + 1;
        const newRows = Array.from({ length: rowsToAdd }, () => ({}));

        // First expand the table
        const expandedState = update(state, {
          skipReset: { $set: true },
          data: { $push: newRows }
        });

        // Then update the cell in the expanded table
        return update(expandedState, {
          skipReset: { $set: true },
          data: {
            [action.rowIndex]: { [action.columnId]: { $set: action.value } }
          }
        });
      }

      if (!state.data[action.rowIndex]) {
        logger.warn(`[UPDATE_CELL] Row ${action.rowIndex} does not exist, skipping update for ${action.columnId}`);
        return state;
      }
      // logger.debug(`[REDUCER] Updating Cell [${action.rowIndex}, ${action.columnId}] = ${action.value ? (action.value.substring ? action.value.substring(0, 10)+'...' : action.value) : 'null'}`);
      return update(state, {
        skipReset: { $set: true },
        data: {
          [action.rowIndex]: { [action.columnId]: { $set: action.value } },
        },
      });
    case ActionTypes.ADD_COLUMN_TO_LEFT:
      {
const leftIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      let leftId = shortId();
      // ✅ FIX: Use sequential numbering for new columns
      // Count existing columns (excluding Document Name and + button)
      const leftColCount = state.columns.filter(c =>
        c.id !== 'Document Name' && c.id !== Constants.ADD_COLUMN_ID
      ).length;
      const leftColLabel = `Column ${leftColCount + 1}`;
      return update(state, {
        skipReset: { $set: true },
        columns: {
          $splice: [
            [
              leftIndex,
              0,
              {
                id: leftId,
                label: leftColLabel,
                accessor: leftId,
                dataType: DataTypes.TEXT,
                created: action.focus && true,
                options: [],
              },
            ],
          ],
        },
      });
}
    case ActionTypes.ADD_COLUMN_TO_RIGHT:
      {
const rightIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      const rightId = action.newColumnId || shortId();
      // ✅ FIX: Use sequential numbering for new columns
      // Count existing columns (excluding Document Name and + button)
      const rightColCount = state.columns.filter(c =>
        c.id !== 'Document Name' && c.id !== Constants.ADD_COLUMN_ID
      ).length;
      const rightColLabel = `Column ${rightColCount + 1}`;
      return update(state, {
        skipReset: { $set: true },
        columns: {
          $splice: [
            [
              rightIndex + 1,
              0,
              {
                id: rightId,
                label: rightColLabel,
                accessor: rightId,
                dataType: DataTypes.TEXT,
                created: action.focus && true,
                options: [],
              },
            ],
          ],
        },
      });
}
    case ActionTypes.DELETE_COLUMN:
      {
const deleteIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      if (deleteIndex < 0) return state; // Column not found

      // Delete the column
      let newColumns = [...state.columns];
      newColumns.splice(deleteIndex, 1);

      // ✅ FIX: Dynamic minimum columns
      // Rule: dataColumns + 5 buffer, minimum 19 total columns
      const actualColumns = newColumns.filter(c => c.id !== Constants.ADD_COLUMN_ID);

      // Count how many named data columns exist (not Document Name, not placeholders)
      const dataColumns = actualColumns.filter(c =>
        c.id !== 'Document Name' && !c.label?.match(/^Column \d*$/)
      );

      // Calculate target: dataColumns + 5, minimum 19
      const BUFFER_COLUMNS = 5;
      const MIN_COLUMNS = 19;
      const targetColumns = Math.max(dataColumns.length + BUFFER_COLUMNS, MIN_COLUMNS);
      const columnsToAdd = targetColumns - actualColumns.length;

      // ✅ Always reorganize: Doc Name + Data Columns + Placeholders + "+" button
      const addBtn = newColumns.find(c => c.id === Constants.ADD_COLUMN_ID);
      const docNameCol = newColumns.find(c => c.id === 'Document Name');
      const existingPlaceholders = actualColumns.filter(c =>
        c.id !== 'Document Name' && c.label?.match(/^Column \d*$/)
      );

      const finalColumns = [];

      // 1. Add Document Name first
      if (docNameCol) finalColumns.push(docNameCol);

      // 2. Add all data columns (keeps data together on left)
      dataColumns.forEach(col => finalColumns.push(col));

      // 3. Renumber and add ALL placeholders sequentially (existing + new)
      // ✅ FIX: Renumber all placeholders so they're sequential (Column 5, 6, 7...)
      const totalPlaceholdersNeeded = existingPlaceholders.length + Math.max(0, columnsToAdd);
      const placeholderStartNum = dataColumns.length + 1; // After data columns

      for (let i = 0; i < totalPlaceholdersNeeded; i++) {
        // Reuse existing placeholder IDs if available, else create new
        if (i < existingPlaceholders.length) {
          // Update label of existing placeholder to be sequential
          finalColumns.push({
            ...existingPlaceholders[i],
            label: `Column ${placeholderStartNum + i}` // Renumber!
          });
        } else {
          // Create new placeholder
          const colId = shortId();
          finalColumns.push({
            id: colId,
            label: `Column ${placeholderStartNum + i}`,
            accessor: colId,
            dataType: DataTypes.TEXT,
            created: false,
            options: [],
          });
        }
      }

      // 5. Add the "+" button at the end
      if (addBtn) finalColumns.push(addBtn);

      newColumns = finalColumns;

      return update(state, {
        skipReset: { $set: true },
        columns: { $set: newColumns },
      });
}
    case ActionTypes.HIDE_COLUMN:
      // ✅ Hide column (set hidden flag, don't delete)
      {
const hideIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      if (hideIndex < 0) return state;
      return update(state, {
        skipReset: { $set: true },
        columns: {
          [hideIndex]: {
            hidden: { $set: true }
          }
        }
      });
}
    case ActionTypes.SHOW_COLUMN:
      // ✅ Show hidden column
      {
const showIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      if (showIndex < 0) return state;
      return update(state, {
        skipReset: { $set: true },
        columns: {
          [showIndex]: {
            hidden: { $set: false }
          }
        }
      });
}
    case ActionTypes.RENAME_COLUMN:
      // ✅ NEW: Rename column in-place (for replace operations)
      // Find the column by ID if provided, otherwise fallback to Label (legacy)
      {
const renameIndex = state.columns.findIndex(
        column => (action.columnId && column.id === action.columnId) || column.label === action.oldLabel
      );

      if (renameIndex < 0) {
        logger.warn('[RENAME_COLUMN] Column not found:', action.columnId || action.oldLabel);
        return state;
      }

      logger.important(`[RENAME] Renaming column idx ${renameIndex}: ${state.columns[renameIndex].label} -> ${action.newLabel}`);

      // Create new columns array with renamed column
      const renamedColumns = state.columns.map((col, idx) => {
        if (idx === renameIndex) {
          return {
            ...col,
            label: action.newLabel,
          };
        }
        return col;
      });

      // ❌ FIX: DO NOT CLEAR DATA on rename. (Preserved)
      return update(state, {
        skipReset: { $set: true },
        columns: { $set: renamedColumns },
      });
}
    case ActionTypes.DELETE_ROWS:
      return update(state, {
        skipReset: { $set: true },
        data: {
          $set: state.data.filter((_, index) => !action.rowIndexes.includes(index))
        },
      });
    case ActionTypes.CLEANUP_STALE_ROWS:
      {
const validNames = action.validDocNames instanceof Set ? action.validDocNames : new Set(action.validDocNames || []);
      const cleanedData = state.data.filter(row =>
        row && validNames.has(row['Document Name'])
      );

      // ✅ FIX: Maintain minimum 20 rows for "Excel-like" feel
      if (cleanedData.length < 20) {
        const rowsNeeded = 20 - cleanedData.length;
        const emptyRows = Array.from({ length: rowsNeeded }, () => ({}));
        cleanedData.push(...emptyRows);
      }
      logger.debug(`[SYNC] Removed ${state.data.length - cleanedData.length} stale rows`);

      // ✅ CRITICAL FIX: If cleanup results in 0 rows, create rows for valid files
      if (cleanedData.length === 0 && validNames.size > 0) {
        logger.debug(`[SYNC] Creating ${validNames.size} rows after cleanup resulted in 0 rows`);
        const newRows = Array.from(validNames).map(docName => ({
          'Document Name': docName
        }));
        return update(state, {
          skipReset: { $set: true },
          data: { $set: newRows }
        });
      }

      return update(state, {
        skipReset: { $set: true },
        data: { $set: cleanedData }
      });
}

    case ActionTypes.RESTORE_TABLE_STATE: {
      const { columns, rows } = action.payload;

      // ✅ FIX: Filter out corrupted columns and ensure accessor is ALWAYS a valid string
      // Skip the "+" add column button - we'll add it fresh at the end
      const restoredColumns = columns
        .filter(col => {
          // Skip add column button (id = 999999 or label = '+')
          if (col.id === Constants.ADD_COLUMN_ID || col.id === 999999 || col.label === '+') return false;
          // Skip columns without proper identifiers
          if (!col.id && !col.label) return false;
          return true;
        })
        .map(col => {
          // Ensure accessor is ALWAYS a string (react-table requirement)
          const accessorStr = String(col.id || col.label);
          return {
            id: col.id || col.label,
            label: col.label || col.id,
            accessor: accessorStr, // ✅ FIX: Ensure accessor is always a string
            dataType: (col.label === 'Document Name' || col.type === 'file')
              ? DataTypes.FILE
              : DataTypes.TEXT,
            type: (col.label === 'Document Name' || col.type === 'file') ? DataTypes.FILE : DataTypes.TEXT,
            options: []
          };
        });

      // Build rows ensuring we don't clobber existing keys if not in row
      // Build rows ensuring we don't clobber existing keys if not in row
      const restoredRows = rows.map(row => {
        if (!row) return {}; // Safety check for sparse/corrupt data

        const rowData = {};
        restoredColumns.forEach(col => {
          // Row data from backend is now structured: { value: "...", citations: [], reasoning: "...", badge: "..." }
          let cellData = row[col.label];

          if (cellData === undefined || cellData === null) {
            rowData[col.id] = "";
          } else if (typeof cellData === 'object') {
            // Comment 3: Preserve structured data
            rowData[col.id] = {
              value: cellData.value || "",
              citations: cellData.citations || [],
              reasoning: cellData.reasoning || null,
              badge: cellData.badge || null
            };
          } else {
            // Fallback for legacy string data
            rowData[col.id] = cellData;
          }
        });
        // Preserve Document Name if stored under a different key or implicit
        if (row["Document Name"]) {
          const docCol = restoredColumns.find(c => c.label === "Document Name");
          if (docCol) rowData[docCol.id] = row["Document Name"];
        }
        return rowData;
      });

      // ✅ FIX: Pad columns to minimum 20 to maintain table structure
      const MIN_COLS = 20;
      let colCounter = restoredColumns.length;
      while (restoredColumns.length < MIN_COLS) {
        const colId = `column_${colCounter++}`;
        restoredColumns.push({
          id: colId,
          label: `Column ${restoredColumns.length}`,
          accessor: colId,
          dataType: DataTypes.TEXT,
          created: false,
          options: []
        });
      }

      // ✅ FIX: Add the special "+" add column button at the end if not present
      // Must match exact format from utils.js makeData()
      const hasAddColumnBtn = restoredColumns.some(c => c.id === Constants.ADD_COLUMN_ID);
      if (!hasAddColumnBtn) {
        restoredColumns.push({
          id: Constants.ADD_COLUMN_ID,
          width: 100,
          label: '+',
          disableResizing: true,
          dataType: 'null',  // ✅ FIX: Match makeData format exactly
        });
      }

      // ✅ FIX: Pad rows to minimum 20 to maintain table structure
      const MIN_ROWS = 20;
      while (restoredRows.length < MIN_ROWS) {
        const emptyRow = {};
        restoredColumns.forEach(col => {
          emptyRow[col.id] = "";
        });
        restoredRows.push(emptyRow);
      }

      return update(state, {
        skipReset: { $set: true },
        columns: { $set: restoredColumns },
        data: { $set: restoredRows },
      });
    }
    case ActionTypes.ENABLE_RESET:
      return update(state, { skipReset: { $set: true } });
    case ActionTypes.TOGGLE_COLUMN_CITATIONS:
      // ✅ PHASE 3.4: Toggle citation visibility for a specific column
      {
const citationIndex = state.columns.findIndex(
        column => column.id === action.columnId
      );
      return update(state, {
        skipReset: { $set: true },
        columns: {
          [citationIndex]: { showCitations: { $set: action.showCitations } }
        },
      });
}
    // ✅ NEW: Smart Animation Targeting
    // Backend sends which rows/columns should show "Extracting..." animation
    case ActionTypes.SET_EXTRACTING_CELLS: {
      const { rowIndices, columnIds } = action;
      console.log('[REDUCER] SET_EXTRACTING_CELLS:', { rowIndices, columnIds });

      // Clone current data and set "Extracting..." placeholder for targeted cells
      const newData = state.data.map((row, rowIdx) => {
        if (!rowIndices.includes(rowIdx)) return row; // Skip non-targeted rows

        const newRow = { ...row };
        columnIds.forEach(colId => {
          // Only set placeholder if cell doesn't have data yet or is empty
          const currentValue = newRow[colId];
          const isEmpty = currentValue === undefined ||
            currentValue === null ||
            currentValue === '' ||
            (typeof currentValue === 'object' && !currentValue.value);

          if (isEmpty) {
            newRow[colId] = {
              value: 'Extracting...',
              isPlaceholder: true,
              isUpdating: true
            };
          } else {
            // Cell has data - mark as updating but keep existing value
            newRow[colId] = typeof currentValue === 'object'
              ? { ...currentValue, isUpdating: true }
              : { value: currentValue, isUpdating: true };
          }
        });
        return newRow;
      });

      return update(state, {
        skipReset: { $set: true },
        data: { $set: newData }
      });
    }
    default:
      return state;
  }
}

function App() {
  // ✅ FIXED: Extract URL params for session restoration, user ID AND auth token (from parent iframe)
  const urlParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      session: params.get('session'),
      user: params.get('user'),  // Firebase UID for session persistence
      token: params.get('token'),  // ✅ NEW: Firebase ID token passed from parent
    };
  }, []);

  // ✅ NEW: Session restoration state
  const [isRestoringSession, setIsRestoringSession] = useState(!!urlParams.session);

  // Page state - determines which view to show
  // States: 'upload' -> 'chat' -> 'loading' -> 'sidebar'
  const [currentPage, setCurrentPage] = useState('upload');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatTitle, setChatTitle] = useState('New Research');  // ✅ Dynamic chat title

  // FIX BUG #1: Use counter to ensure unique message IDs (prevents duplicates)
  const messageIdCounter = useRef(0);




  // ✅ NEW: Firebase User State
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ✅ NEW: Store token from URL (passed from parent iframe)
  const [parentToken, setParentToken] = useState(urlParams.token);
  const [parentUserId, setParentUserId] = useState(urlParams.user);

  // ✅ UPDATED: Listen for Auth State Changes OR use token from parent
  useEffect(() => {
    // ✅ PRIORITY 1: Use token from parent iframe (cross-origin auth)
    if (urlParams.token && urlParams.user) {
      console.log('[App] 🔐 Using token from parent iframe for user:', urlParams.user);
      localStorage.setItem('auth_token', urlParams.token);
      setParentToken(urlParams.token);
      setParentUserId(urlParams.user);
      setAuthLoading(false);
      return; // Skip Firebase auth - use parent token
    }

    // ✅ PRIORITY 2: Fallback to Firebase auth (standalone mode)
    if (!auth) {
      console.warn('Firebase Auth not initialized and no parent token');
      setAuthLoading(false);
      return;
    };
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('[App] 👤 Auth State Changed:', currentUser ? currentUser.uid : 'Logged Out');
      if (currentUser) {
        try {
          // Force refresh to get valid token
          const token = await currentUser.getIdToken(true);
          localStorage.setItem('auth_token', token);
          console.log('[App] 🔐 Auth Token synced to localStorage');
        } catch (e) {
          console.error('[App] Failed to sync token:', e);
        }
      } else {
        localStorage.removeItem('auth_token');
      }
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [urlParams.token, urlParams.user]);

  // ✅ NEW: Listen for token refresh from parent iframe
  useEffect(() => {
    const handleTokenRefresh = (event) => {
      if (event.data?.type === 'tokenRefresh' && event.data?.token) {
        console.log('[App] 🔄 Received refreshed token from parent');
        localStorage.setItem('auth_token', event.data.token);
        setParentToken(event.data.token);
      }
    };

    window.addEventListener('message', handleTokenRefresh);
    return () => window.removeEventListener('message', handleTokenRefresh);
  }, []);
  const webSearchEnabledRef = useRef(true);  // Default: enabled

  // Cleanup timeout ref for robust state clearing
  const cleanupTimeoutRef = useRef(null);

  // NEW: Typing animation and thinking indicator state
  // Debug: Log chat messages
  useEffect(() => {
    console.log('[App] Chat Messages Updated:', chatMessages);
  }, [chatMessages]);

  const [isThinking, setIsThinking] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState("Analyzing your query...");



  // ✅ NEW: Extraction logs for terminal view
  const [extractionLogs, setExtractionLogs] = useState([]);

  // NEW: Scroll position preservation for sidebar
  const chatContainerRef = useRef(null);
  const [shouldPreserveScroll, setShouldPreserveScroll] = useState(false);


  // Helper function to format text with markdown-like styling
  const formatText = (text) => {
    if (!text) return null;

    // Split by lines to handle line breaks properly
    const lines = text.split('\n');

    return lines.map((line, lineIdx) => {
      // Handle bold text **text**
      const parts = line.split(/(\*\*.*?\*\*)/g);

      const formatted = parts.map((part, partIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          // Bold text
          return (
            <strong key={`${lineIdx}-${partIdx}`}>
              {part.slice(2, -2)}
            </strong>
          );
        } else if (part.trim().startsWith('- ')) {
          // List item
          return (
            <div key={`${lineIdx}-${partIdx}`} style={{ paddingLeft: '12px' }}>
              {part}
            </div>
          );
        } else {
          // Normal text
          return <span key={`${lineIdx}-${partIdx}`}>{part}</span>;
        }
      });

      return (
        <div key={lineIdx}>
          {formatted}
          {lineIdx < lines.length - 1 && <br />}
        </div>
      );
    });
  };

  // ✅ RESTORED: Initialize with default grid structure
  // DEFAULT: 20 horizontal columns + 8 vertical rows (as user requested)
  const createDefaultColumns = () => {
    const defaultColumns = [];

    // First column: Document Name (always present)
    // ✅ CRITICAL FIX: Use 'Document Name' as both id and accessor for consistency
    defaultColumns.push({
      id: 'Document Name',
      label: 'Document Name',
      accessor: 'Document Name',
      dataType: DataTypes.FILE,
      created: false,
      options: [],
    });

    // ✅ RESTORED: 19 additional columns for default 20-column layout
    // User can add more dynamically, but this provides a good starting grid
    for (let i = 1; i <= 19; i++) {
      const colId = shortId();
      defaultColumns.push({
        id: colId,
        label: `Column ${i}`,
        accessor: colId,
        dataType: DataTypes.TEXT,
        created: false,
        options: [],
      });
    }

    // ✅ CRITICAL FIX: Add the special "ADD COLUMN" button at the end
    // This provides the "+" icon that allows users to add more columns
    defaultColumns.push({
      id: Constants.ADD_COLUMN_ID,
      width: 100,
      label: '+',
      disableResizing: true,
      dataType: DataTypes.TEXT,
      created: false,
      options: [],
    });

    return defaultColumns;
  };

  const createDefaultRows = (columns) => {
    // ✅ RESTORED: Create 8 default rows (as user requested)
    // These provide a ready-to-use grid structure
    // Numbering starts from 1 when user adds data
    return Array(20).fill(null).map(() => ({}));
  };

  // Table state - START WITH 20 COLUMNS + 7 ROWS
  const initialColumns = createDefaultColumns();
  const [state, dispatch] = useReducer(reducer, {
    skipReset: false,
    columns: initialColumns,
    data: createDefaultRows(initialColumns)
  });

  // ✅ FIX: Track latest state with ref to avoid stale closures in WebSocket handlers
  const stateRef = useRef(state);

  // ✅ Feature Flag State (Moved here to access 'state')
  const [schemaVersion, setSchemaVersion] = useState(0);

  // Bump schema version when columns change length or IDs
  useEffect(() => {
    setSchemaVersion(v => v + 1);
  }, [state.columns.length, JSON.stringify(state.columns.map(c => c.id))]);

  // [REFINE] State to track which column is being actively refined/replaced
  const [refiningColumn, setRefiningColumn] = useState(null);
  const refiningColumnRef = useRef(null);
  const handleChatMessageRef = useRef(null);

  const columnRegistryRef = useRef(new Map());
  const replacedColumnPositionRef = useRef(null);

  useEffect(() => {
    refiningColumnRef.current = refiningColumn;
  }, [refiningColumn]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // WebSocket and extraction state
  const [sessionId, setSessionId] = useState(null);
  const sessionNotifiedRef = useRef(false); // ✅ Track if parent has been notified (like Research Agent's hasStarted)
  // [COMMENT 5] Removed unused isConnected state - relying on service.isConnected()
  const [extractionStatus, setExtractionStatus] = useState('idle');
  const [uploadStatus, setUploadStatus] = useState('idle'); // ✅ Added missing state
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [sessionFilesMap, setSessionFilesMap] = useState(new Map()); // ✅ NEW: Maps display_name → actual_filename_with_uuid
  const [fileProgress, setFileProgress] = useState([]);
  const [extractionFields, setExtractionFields] = useState([]);
  const [extractionResults, setExtractionResults] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  const buildTableContext = useCallback(() => {
    const current = stateRef.current || state;
    const columns = (current.columns || [])
      .filter(column => column && !column.hidden && column.id !== Constants.ADD_COLUMN_ID && column.label !== '+')
      .map(column => ({
        id: column.id,
        label: column.label || column.id,
        accessor: column.accessor || column.id,
        dataType: column.dataType || 'text'
      }));

    const rows = (current.data || [])
      .map(row => {
        const mapped = {};
        columns.forEach(column => {
          const value = row?.[column.accessor] ?? row?.[column.id] ?? row?.[column.label];
          if (value !== undefined && value !== null && value !== '') {
            mapped[column.label] = value;
          }
        });
        return mapped;
      })
      .filter(row => Object.keys(row).length > 0)
      .slice(0, 20);

    return {
      columns,
      rows,
      uploaded_files: uploadedFiles.map(file => ({
        display_name: file.display_name || file.name || file.filename,
        filename: file.filename,
        size: file.size
      })),
      conversation: chatMessages.slice(-10).map(message => ({
        role: message.role || message.sender || 'user',
        content: message.content || message.text || ''
      }))
    };
  }, [state, uploadedFiles, chatMessages]);

  // ✅ NEW: Chat WebSocket state
  const [pendingModification, setPendingModification] = useState(null);
  const [isChatTyping, setIsChatTyping] = useState(false);

  // ✅ NEW: Field Limit Confirmation State
  const [showFieldLimitModal, setShowFieldLimitModal] = useState(false);
  const [fieldLimitData, setFieldLimitData] = useState(null);

  // ✅ NEW: Mutable ref to track file->row assignments synchronously
  // This prevents race conditions where multiple stream events read stale state
  const fileRowMapRef = useRef(new Map());

  // ✅ NEW: Source Viewer State
  const [sourceViewerOpen, setSourceViewerOpen] = useState(false);
  const [currentSource, setCurrentSource] = useState(null);
  const [highlightValue, setHighlightValue] = useState(null);

  // ✅ NEW: Track columns currently being updated for animation
  const [updatingColumns, setUpdatingColumns] = useState(new Set());

  // ✅ CRITICAL FIX: Refs for Refine Flow and Chat
  // These are already defined above (lines 247-259)


  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [pdfViewerData, setPdfViewerData] = useState({ filename: '', chunkText: '', sessionId: '', citations: [] });

  const openSourceViewer = (source, highlightValue) => {
    const filename = source.filename || '';
    const lowerFilename = filename.toLowerCase();

    console.log('[openSourceViewer] Called with:', {
      filename,
      text: source.text?.substring(0, 100),
      source
    });

    // ✅ SIMPLIFIED: If there's a filename and it's not a URL, try PDF viewer
    // Most document uploads are PDFs
    const isUrl = lowerFilename.startsWith('http') || lowerFilename.includes('://');
    const hasPdfExtension = lowerFilename.endsWith('.pdf');
    const hasValidFilename = filename && filename.length > 0 && !isUrl;

    if (hasPdfExtension || hasValidFilename) {
      // Ensure filename has .pdf extension for backend
      let pdfFilename = filename;
      if (!lowerFilename.endsWith('.pdf') && !isUrl) {
        pdfFilename = filename + '.pdf';
      }

      console.log('[openSourceViewer] Opening PDF viewer:', {
        pdfFilename,
        chunkText: source.text?.substring(0, 50),
        sessionId
      });

      setPdfViewerData({
        filename: pdfFilename,
        chunkText: source.text || highlightValue || '',
        sessionId: sessionId,
        citations: source.citations || [] // ✅ Pass all citations for navigation
      });
      setPdfViewerOpen(true);
    } else {
      // Fallback to text viewer for web sources
      console.log('[openSourceViewer] Opening text viewer (fallback)');
      setCurrentSource(source);
      setHighlightValue(highlightValue);
      setSourceViewerOpen(true);
    }
  };

  const dispatchWithHistory = (action) => {
    const undoableActions = [
      ActionTypes.DELETE_ROWS,
      ActionTypes.DELETE_COLUMN,
      ActionTypes.UPDATE_CELL,
      ActionTypes.ADD_ROW,
    ];

    if (undoableActions.includes(action.type)) {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push({ data: state.data, columns: state.columns });
        return newHistory.slice(-50);
      });
      setHistoryIndex(prev => Math.min(prev + 1, 49));
    }
    dispatch(action);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex >= 0 && history[historyIndex]) {
          const previousState = history[historyIndex];
          dispatch({
            type: 'RESTORE_STATE',
            data: previousState.data,
            columns: previousState.columns,
          });
          setHistoryIndex(prev => prev - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex]);

  useEffect(() => {
    dispatch({ type: ActionTypes.ENABLE_RESET });
  }, [state.data, state.columns]);

  // ✅ FIX: Sync fileRowMapRef whenever table data or columns change
  // This ensures map is always up-to-date after any reducer action (add row, restore, cleanup)
  useEffect(() => {
    const docCol = state.columns.find(c => c.label === 'Document Name' || c.dataType === DataTypes.FILE);
    const docColId = docCol ? docCol.id : 'Document Name';

    fileRowMapRef.current.clear();
    state.data.forEach((row, rowIndex) => {
      // ✅ FIX: Check both docColId AND string 'Document Name' for robustness
      const cellVal = row[docColId] || row['Document Name'];
      const docName = (typeof cellVal === 'object' && cellVal?.value) ? cellVal.value : cellVal;

      if (docName && String(docName).trim() !== '') {
        const cleanName = String(docName).trim();
        fileRowMapRef.current.set(cleanName, rowIndex);
        // Also add normalized version (no UUID prefix)
        const normalizedName = cleanName.replace(/^[a-f0-9-]+_/i, '');
        if (normalizedName !== cleanName) {
          fileRowMapRef.current.set(normalizedName, rowIndex);
        }
      }
    });

    // ✅ DEBUG: Log what's in the map after sync
    console.log(`[FILE_MAP_SYNC] Synced. Map now has ${fileRowMapRef.current.size} entries:`, Array.from(fileRowMapRef.current.entries()));
    logger.debug('[FILES_MAP] Auto-synced file-row mapping via Effect:', fileRowMapRef.current.size);
  }, [state.data, state.columns]);

  // ✅ NEW: Debounced auto-save to Firestore
  // Save table state 3 seconds after any change to prevent excessive API calls
  const saveTimeoutRef = useRef(null);
  const lastSaveHashRef = useRef('');

  useEffect(() => {
    // Skip if no session or user
    const userId = parentUserId || user?.uid;
    if (!sessionId || !userId) return;

    // Skip if we're still restoring
    if (isRestoringSession) return;

    // Skip if table is essentially empty (initial state)
    const hasData = state.data.some(row => {
      const docName = row['Document Name'];
      return docName && (typeof docName === 'string' ? docName.trim() !== '' : docName?.value?.trim() !== '');
    });
    if (!hasData) return;

    // Create hash to detect actual changes (avoid saving same state)
    const stateHash = JSON.stringify({
      cols: state.columns.map(c => c.label).join(','),
      rows: state.data.length,
      firstRow: state.data[0] ? Object.keys(state.data[0]).join(',') : ''
    });

    if (stateHash === lastSaveHashRef.current) return;

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(async () => {
      console.log('[AUTO_SAVE] 💾 Saving table state to Firestore...');
      const success = await saveTableStateToFirestore(
        userId,
        sessionId,
        state.columns,
        state.data,
        chatTitle
      );
      if (success) {
        lastSaveHashRef.current = stateHash;
      }
    }, 3000); // 3 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state.data, state.columns, sessionId, parentUserId, user, chatTitle, isRestoringSession]);

  // ✅ NEW: Auto-save assistant messages to Firestore
  // Track last saved message count to only save new messages
  const lastSavedMessageCountRef = useRef(0);

  useEffect(() => {
    // Skip if no session or user
    const userId = parentUserId || user?.uid;
    if (!sessionId || !userId) return;

    // Skip if restoring (don't re-save restored messages)
    if (isRestoringSession) {
      lastSavedMessageCountRef.current = chatMessages.length;
      return;
    }

    // Check for new assistant messages that aren't already restored/saved
    const newMessages = chatMessages.slice(lastSavedMessageCountRef.current);
    const assistantMessages = newMessages.filter(msg =>
      (msg.role === 'assistant' || msg.role === 'ai') && !msg.isRestored
    );

    // Save each new assistant message
    assistantMessages.forEach(msg => {
      if (msg.content) {
        saveMessageToFirestore(userId, sessionId, 'assistant', msg.content);
      }
    });

    // Update last saved count
    lastSavedMessageCountRef.current = chatMessages.length;
  }, [chatMessages, sessionId, parentUserId, user, isRestoringSession]);

  // Initialize session and fetch existing files
  useEffect(() => {

    const attemptRestoration = async (sid) => {
      try {
        // ✅ SECURITY: Include auth token for user verification
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/data-extraction/session/${sid}/table-state`, {
          headers: {
            'Authorization': `Bearer ${token || ''}`
          }
        });

        // ✅ SECURITY: Handle unauthorized access
        if (response.status === 401 || response.status === 403) {
          logger.warn(`🚫 [SECURITY] Unauthorized session access - redirecting to upload`);
          return false;
        }

        const data = await response.json();

        if (data.success && data.table_data) {
          const { columns, rows } = data.table_data;

          // Only restore if table has data
          if (columns && columns.length > 0 && rows && rows.length > 0) {

            // [COMMENT 2] Reject backend's 20-row default (1 column 'Document Name', empty rows)
            // This forces frontend to use its own rich default (20 cols)
            const isBackendDefault = columns.length === 1 &&
              columns[0].label === 'Document Name' &&
              rows.every(r => !r['Document Name'] || r['Document Name'] === "");

            if (isBackendDefault) {
              logger.debug('⚠️ Backend returned default empty table, treating as fresh');
              return false;
            }

            logger.debug(`🔄 Restoring table state: ${columns.length} columns, ${rows.length} rows`);

            dispatch({
              type: ActionTypes.RESTORE_TABLE_STATE,
              payload: { columns, rows }
            });

            // Update column registry for subsequent WebSocket streams
            columnRegistryRef.current = new Map();
            columns.forEach(col => {
              const id = col.id || col.label;
              columnRegistryRef.current.set(col.label, id);
            });
            logger.debug('✅ Column registry updated:', Array.from(columnRegistryRef.current.entries()));
            logger.debug('✅ Restored column IDs:', columns.map(c => ({ label: c.label, id: c.id })));

            // fileRowMapRef initialization handled by useEffect
            // logger.debug('✅ File-Row map initialized:', Object.fromEntries(fileRowMapRef.current));

            // Navigate to chat page if data exists
            // setCurrentPage('chat');
            setExtractionStatus('complete');

            // Also fetch files to ensure "Files" state is correct
            try {
              const fileResp = await apiService.getSessionFiles(sid);
              if (fileResp && fileResp.files) {
                setUploadedFiles(fileResp.files);
                setUploadStatus('complete');

                // ✅ NEW: Populate sessionFilesMap for restored sessions
                if (fileResp.files.length > 0) {
                  const filesMap = new Map();
                  fileResp.files.forEach(file => {
                    const displayName = file.display_name || file.filename;
                    const actualFilename = file.file_path ? file.file_path.split('/').pop() : file.filename;
                    filesMap.set(displayName, actualFilename);
                  });
                  setSessionFilesMap(filesMap);
                  logger.debug('[FILES_MAP] Restored mapping:', Object.fromEntries(filesMap));
                }
              }
            } catch (e) { logger.warn("Could not sync files on restore", e); }

            return true;
          }
        }
      } catch (restoreError) {
        logger.warn('⚠️ Could not restore table state:', restoreError);
      }
      return false;
    };

    const initializeSession = async () => {
      try {
        // ✅ NEW: Check if we have a session ID in URL (from sidebar click)
        if (urlParams.session) {
          logger.debug(`🔄 Restoring session from URL: ${urlParams.session}`);
          setIsRestoringSession(true);

          // Set session ID from URL
          setSessionId(urlParams.session);
          apiService.setSessionId(urlParams.session);

          try {
            // Try to restore messages from Firestore with correct user ID
            const userId = urlParams.user || 'anonymous';
            logger.debug(`🔥 [FIRESTORE] Restoring session for user: ${userId}`);
            const response = await fetch(`${SESSION_SERVICE_URL}/sessions/${userId}/${urlParams.session}`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
              }
            });

            // ✅ SECURITY FIX: Block unauthorized session access
            if (response.status === 401 || response.status === 403) {
              logger.warn(`🚫 [SECURITY] Unauthorized access to session ${urlParams.session} - redirecting to upload`);
              console.warn('🚫 [SECURITY] You do not have permission to view this session. Starting fresh.');

              // Clear session params and redirect to upload page
              setSessionId(null);
              apiService.clearSession();
              setIsRestoringSession(false);
              setCurrentPage('upload');
              return; // Exit immediately - don't show any data
            }

            if (response.ok) {
              const data = await response.json();

              // ✅ FIXED: Restore title FIRST, even if no messages
              if (data.session?.title) {
                setChatTitle(data.session.title);
                logger.debug(`✅ Restored chat title: ${data.session.title}`);
              }

              // Restore chat messages if available
              if (data.messages && data.messages.length > 0) {
                logger.debug(`✅ Restoring ${data.messages.length} messages from Firestore`);

                // ✅ FIX: Deduplicate messages - remove consecutive duplicates by content
                const deduplicatedMessages = [];
                let lastContent = '';
                let lastRole = '';

                for (const msg of data.messages) {
                  // Skip if this message has the same content AND role as the previous one
                  if (msg.content === lastContent && msg.role === lastRole) {
                    console.log('[RESTORE_DEDUPE] Skipping duplicate:', msg.content?.slice(0, 50));
                    continue;
                  }
                  deduplicatedMessages.push(msg);
                  lastContent = msg.content;
                  lastRole = msg.role;
                }

                if (deduplicatedMessages.length < data.messages.length) {
                  console.log(`[RESTORE_DEDUPE] Removed ${data.messages.length - deduplicatedMessages.length} duplicates`);
                }

                const restoredMessages = deduplicatedMessages.map((msg, idx) => ({
                  id: `restored-${idx}`,
                  role: msg.role === 'user' ? 'user' : 'assistant',  // ✅ FIX: Standardize to 'assistant' (not 'ai')
                  content: msg.content,
                  timestamp: msg.timestamp,
                  animated: true,  // ✅ Skip typewriter animation for restored messages
                  isRestored: true  // ✅ NEW: Mark as restored to prevent re-saving
                }));
                setChatMessages(restoredMessages);
                // ✅ FIX: Set lastSavedMessageCount to prevent re-saving restored messages
                lastSavedMessageCountRef.current = restoredMessages.length;
                logger.debug(`✅ Set chat messages:`, restoredMessages);
              }

              // ✅ NEW: Restore table state from Firestore if available
              if (data.tableState && data.tableState.columns && data.tableState.data) {
                logger.debug(`✅ [FIRESTORE] Restoring table: ${data.tableState.columns.length} cols, ${data.tableState.data.length} rows`);

                // Convert Firestore format back to frontend format
                const firestoreColumns = data.tableState.columns;
                const firestoreData = data.tableState.data;

                // Dispatch restore action
                dispatch({
                  type: ActionTypes.RESTORE_TABLE_STATE,
                  payload: {
                    columns: firestoreColumns,
                    rows: firestoreData
                  }
                });

                // Update column registry
                columnRegistryRef.current = new Map();
                firestoreColumns.forEach(col => {
                  columnRegistryRef.current.set(col.label, col.id || col.label);
                });
                logger.debug('✅ [FIRESTORE] Column registry updated from Firestore');

                // Mark restoration complete and navigate
                setExtractionStatus('complete');
                setIsRestoringSession(false);
                setCurrentPage('sidebar');
                return; // Skip backend table-state API since we got it from Firestore
              }
            }
          } catch (firestoreError) {
            logger.warn('Could not restore from Firestore:', firestoreError);
          }

          // Also try to restore table state from backend
          const restored = await attemptRestoration(urlParams.session);
          logger.debug(`🔄 Table restoration result: ${restored ? 'SUCCESS' : 'NO_DATA'}`);

          // ✅ FIXED: ALWAYS navigate to sidebar view when restoring session
          // Even if table data wasn't restored, show the chat interface with messages
          setCurrentPage('sidebar');
          logger.debug('✅ Navigated to sidebar view for restored session');

          setIsRestoringSession(false);
          return;
        }

        // ✅ FRESH SESSION: Always create a new session on page load
        // This ensures files from previous sessions don't get mixed up
        // User explicitly requested this behavior - no session restoration

        // Clear any existing session first
        apiService.clearSession();

        logger.debug('🆕 Creating FRESH session (no restoration)...');
        const currentSessionId = apiService.createSession();
        setSessionId(currentSessionId);

        logger.debug(`✅ New session created: ${currentSessionId}`);

        // ✅ NOTE: sessionCreated postMessage is now sent in handleFilesProcessed
        // This ensures sidebar/URL update only after user actually uploads files

        // ✅ NOTE: Firestore session save is now DELAYED until LLM generates title
        // This prevents empty "New Data Extraction" sessions from page refreshes

        // Initialize column registry for fresh session
        columnRegistryRef.current = new Map();
        columnRegistryRef.current.set('Document Name', 'Document Name');

        // Clear fileRowMapRef for fresh session
        fileRowMapRef.current = new Map();

        logger.debug('✅ Initialized column registry and file-row map for fresh session');

        // New/Fresh session -> Show upload interface
        logger.debug('📁 Showing upload interface for fresh session');
        setCurrentPage('upload');

      } catch (error) {
        logger.error('Failed to initialize session:', error);
        setIsRestoringSession(false);
        setCurrentPage('upload');
      }
    };

    initializeSession();
  }, []); // Only run once on mount

  // ✅ FIX: User requested backup polling loop (45s * 20 attempts)
  // This ensures that even if WebSocket signal is missed, we check status periodically.
  useEffect(() => {
    let pollInterval;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    // Only poll if we are processing and have a valid session
    if (uploadStatus === 'processing' && sessionId) {
      logger.debug('🔄 [POLL] Starting backup status checks... (45s intervals)');

      pollInterval = setInterval(async () => {
        attempts++;
        logger.debug(`⏱️ [POLL] Attempt ${attempts}/${MAX_ATTEMPTS} to check file status...`);

        try {
          // Check session files status from backend
          const data = await apiService.getSessionFiles(sessionId);

          if (data && data.files && data.files.length > 0) {
            // Check if ALL files are done (indexed or processed)
            // Note: Adjust status check based on actual backend response values
            const allReady = data.files.every(f =>
              f.status === 'indexed' || f.status === 'processed' || f.status === 'complete'
            );

            if (allReady) {
              logger.debug('✅ [POLL] All files ready! Forcing navigation.');
              setUploadStatus('complete');
              setExtractionStatus('ready_for_extraction');

              // Force navigation safely [COMMENT 2]
              // Skip navigation if user is already on sidebar (viewing table)
              if (['upload', 'loading', 'processing'].includes(currentPage)) {
                setCurrentPage('sidebar');  // Changed to 'sidebar' to go directly to table view
              } else {
                logger.debug(`[POLL] Skipping navigation, user is on page: ${currentPage}`);
              }
              clearInterval(pollInterval);
            } else {
              logger.debug(`ℹ️ [POLL] Files not ready yet. Statuses: ${data.files.map(f => f.status).join(', ')}`);
            }
          }
        } catch (err) {
          logger.warn('⚠️ [POLL] Check failed:', err);
        }

        if (attempts >= MAX_ATTEMPTS) {
          logger.debug('❌ [POLL] Max attempts reached. Stopping checks.');
          clearInterval(pollInterval);
          // Optional: Force user to chat anyway or show error?
          // User didn't specify, but stopping is safer.
        }
      }, 45000); // 45 seconds per user request
    }

    // Cleanup on unmount or status change
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [uploadStatus, sessionId]);

  // Initialize WebSocket connection (ALWAYS when session exists, including during upload)

  // ✅ REFACTORED: WebSocket logic moved to useExtractionWebSocket hook
  useExtractionWebSocket({
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
    setCurrentPage, // ✅ Passed for navigation
    currentPage, // ✅ Passed for state checking
    replacedColumnPositionRef // ✅ Passed for column replacement positioning
  });

  // Chat WebSocket logic removed - using unified websocketService
  // ✅ NEW: Sync files with chat agent
  useEffect(() => {
    // [COMMENT 5] Check service state directly
    if (websocketService.isConnected() && uploadedFiles.length > 0) {
      websocketService.send({
        type: 'update_files',
        files: uploadedFiles
      });
      logger.debug('📁 [CHAT_WS] Updated files:', uploadedFiles.length);
    }
  }, [uploadedFiles]); // Removed isConnected dependency

  // ✅ NEW: Sync columns with chat agent
  useEffect(() => {
    // [COMMENT 5] Check service state directly
    if (websocketService.isConnected()) {
      const columnNames = state.columns.map(c => c.label);
      websocketService.send({
        type: 'update_columns',
        columns: columnNames
      });
      logger.debug('📊 [CHAT_WS] Updated columns:', columnNames);
    }
  }, [state.columns]); // Removed isConnected dependency

  // NEW: Preserve scroll position when table updates (fix sidebar scroll reset on column click)
  useEffect(() => {
    if (chatContainerRef.current && shouldPreserveScroll) {
      // Scroll position is automatically preserved by browser
      // This effect just resets the flag
      setShouldPreserveScroll(false);
    }
  }, [state.columns, state.data, shouldPreserveScroll]);

  // NEW: Preserve horizontal scroll position in table container
  const tableContainerRef = useRef(null);
  const scrollPositionRef = useRef({ scrollLeft: 0, scrollTop: 0 });

  // Save scroll position on every scroll
  useEffect(() => {
    const container = tableContainerRef.current;
    if (container) {
      const handleScroll = () => {
        scrollPositionRef.current = {
          scrollLeft: container.scrollLeft,
          scrollTop: container.scrollTop
        };
      };
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Restore scroll position after DATA updates only (not column menu toggles)
  // This preserves scroll when new data arrives via WebSocket
  useEffect(() => {
    const container = tableContainerRef.current;
    if (container && scrollPositionRef.current && state.data.length > 0) {
      // Only restore if we actually have data (prevents restoration on initial load)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (container) {
            // Temporarily disable smooth scrolling for instant restoration
            const originalBehavior = container.style.scrollBehavior;
            container.style.scrollBehavior = 'auto';

            // Restore scroll position
            container.scrollLeft = scrollPositionRef.current.scrollLeft;
            container.scrollTop = scrollPositionRef.current.scrollTop;

            // Restore smooth scrolling after a brief delay
            setTimeout(() => {
              if (container) {
                container.style.scrollBehavior = originalBehavior || 'smooth';
              }
            }, 0);
          }
        });
      });
    }
  }, [state.data.length]); // Only restore on data changes, NOT column changes

  // Handle file upload from FileUploadPage
  const handleFilesProcessed = async (files, callbacks) => {
    try {
      // ✅ MOVED: sessionCreated postMessage to AFTER upload API returns
      // Previously this was here, but it caused parent to update URL with ?session=...
      // which triggered iframe reload before files were uploaded.
      // Now moved to after line 1353 (after apiService.uploadFiles returns)

      setIsProcessing(true);
      setExtractionStatus('uploading');

      // ✅ CRITICAL FIX: Connect WebSocket BEFORE upload so we can receive indexingComplete
      // Without this, backend sends indexingComplete but frontend isn't listening yet
      try {
        if (!websocketService.isConnected()) {
          console.log('[UPLOAD] 🔌 Connecting WebSocket before upload...');

          let token = null;
          let uid = null;

          // ✅ PRIORITY 1: Use token from parent iframe (cross-origin)
          if (parentToken && parentUserId) {
            token = parentToken;
            uid = parentUserId;
            console.log('[UPLOAD] 🔐 Using parent iframe token for user:', uid);
          }
          // ✅ PRIORITY 2: Use Firebase auth (standalone mode)
          else if (user) {
            token = await user.getIdToken();
            uid = user.uid;
            console.log('[UPLOAD] 🔐 Using Firebase auth token for user:', uid);
          } else {
            console.warn('[UPLOAD] ⚠️ No auth available for WebSocket connection');
          }

          // Use the auth state we just resolved
          await websocketService.connect(sessionId, getWsUrl('/api/ws'), uid, token);
          console.log('[UPLOAD] ✅ WebSocket connected! Ready to receive indexingComplete signal.');
        } else {
          console.log('[UPLOAD] ✅ WebSocket already connected');
        }
      } catch (wsError) {
        console.error('[UPLOAD] ⚠️ WebSocket connection failed, proceeding with upload anyway:', wsError);
        // Don't block upload if WebSocket fails - polling will handle navigation
      }

      console.log('[UPLOAD] 📤 Starting file upload API call...');
      // Upload files via API
      const result = await apiService.uploadFiles(
        sessionId,
        files,
        (progress) => {
          if (callbacks.onUploadProgress) {
            callbacks.onUploadProgress(progress);
          }
        }
      );

      // ✅ MOVED: Notify parent of session AFTER upload succeeds (not before!)
      // This prevents iframe reload before files are uploaded
      if (!sessionNotifiedRef.current && sessionId && window.parent !== window) {
        sessionNotifiedRef.current = true; // Mark as notified, won't send again
        window.parent.postMessage({
          type: 'sessionCreated',
          sessionId: sessionId,
          title: 'New Data Extraction',
          agentType: 'data_extraction'
        }, '*');
        console.log('📢 [SESSION] Notified parent of new session AFTER upload:', sessionId);
      }

      logger.debug('Files uploaded:', result);
      setUploadedFiles(result.uploaded_files || []);


      // ✅ NEW: Populate sessionFilesMap for PDF filename resolution
      if (result.uploaded_files && result.uploaded_files.length > 0) {
        const filesMap = new Map();
        result.uploaded_files.forEach(file => {
          const displayName = file.display_name || file.filename;
          // Extract actual filename from file_path: "data_extraction_pdfs/session_xxx/{uuid}_filename.pdf"
          const actualFilename = file.file_path ? file.file_path.split('/').pop() : file.filename;
          filesMap.set(displayName, actualFilename);
        });
        setSessionFilesMap(filesMap);
        logger.debug('[FILES_MAP] Created mapping:', Object.fromEntries(filesMap));
      }

      // NEW: Cleanup stale rows
      // Cleanup logic moved to after row creation to prevent 0-row state

      // ✅ FIX: Immediately create rows for all uploaded files
      if (result.uploaded_files && result.uploaded_files.length > 0) {
        logger.debug('[UI] Creating rows for uploaded files:', result.uploaded_files);

        // ✅ COMMENT 2: Resolve actual Column ID for Document Name
        const docCol = stateRef.current.columns.find(c => c.label === 'Document Name' || c.dataType === DataTypes.FILE);
        const docColId = docCol ? docCol.id : 'Document Name';

        // Filter out files that already exist in the table using dynamic ID
        const newFiles = result.uploaded_files.filter(file =>
          !stateRef.current.data.some(row => {
            const val = row[docColId];
            const text = (typeof val === 'object' && val?.value) ? val.value : val;
            return text === file.display_name;
          })
        );

        if (newFiles.length > 0) {
          // ✅ EXPERT FIX: Fill empty rows first to maintain "Excel-like" feel
          const currentData = stateRef.current.data;
          const updates = [];
          const newRowsToAdd = [];
          let fileIdx = 0;

          // 1. Find and fill empty rows
          for (let i = 0; i < currentData.length && fileIdx < newFiles.length; i++) {
            const row = currentData[i];
            const cellVal = row[docColId];
            const cellText = (typeof cellVal === 'object' && cellVal?.value) ? cellVal.value : cellVal;

            // Check if row is "empty" (no Document Name)
            if (!cellText || String(cellText).trim() === '') {
              updates.push({
                rowIndex: i,
                columnId: docColId, // Use dynamic ID
                value: newFiles[fileIdx].display_name
              });
              fileIdx++;
            }
          }

          // 2. Dispatch updates for existing rows
          updates.forEach(update => {
            dispatch({
              type: ActionTypes.UPDATE_CELL,
              rowIndex: update.rowIndex,
              columnId: update.columnId,
              value: update.value
            });
          });

          // 3. Prepare remaining files as new rows
          for (; fileIdx < newFiles.length; fileIdx++) {
            newRowsToAdd.push({
              [docColId]: newFiles[fileIdx].display_name // Use dynamic ID
            });
          }

          // 4. Add new rows if we ran out of empty space
          if (newRowsToAdd.length > 0) {
            dispatch({
              type: ActionTypes.ADD_MULTIPLE_ROWS,
              rows: newRowsToAdd
            });
          }

          logger.debug(`[UI] Filled ${updates.length} empty rows, added ${newRowsToAdd.length} new rows`);
        }
      }

      // After row creation/updates complete
      // fileRowMapRef is now automatically synced via useEffect on state change

      logger.debug('[FILES_MAP] Waiting for Effect to sync file-row mapping...');

      // ✅ NEW: Cleanup stale rows AFTER ensuring new rows exist
      if (result.uploaded_files && result.uploaded_files.length > 0) {
        const validDocNames = new Set(
          result.uploaded_files.map(f => f.display_name)
        );

        dispatch({
          type: ActionTypes.CLEANUP_STALE_ROWS,
          validDocNames: validDocNames
        });

        logger.debug('[SYNC] Cleaned up stale rows after creation, keeping only:', validDocNames);
      }

      // Simulate indexing progress (will be replaced by real WebSocket updates)
      if (callbacks.onIndexingProgress) {
        for (let i = 0; i <= 100; i += 20) {
          await new Promise(resolve => setTimeout(resolve, 300));
          callbacks.onIndexingProgress(i);
        }
      }

      setUploadStatus('processing');

      // ✅ FIX: Do NOT call onComplete here. We wait for backend signal.
      // callbacks.onComplete();

      // Expecting 'indexingComplete' via WebSocket to handle page switch
      logger.debug('[UPLOAD] Files uploaded, waiting for indexing signal...');

      // ✅ CRITICAL FIX: Add aggressive fallback polling for iframe context
      // WebSocket often disconnects in iframe, missing the indexingComplete signal
      // Poll every 3 seconds for up to 30 seconds to check if files are ready
      const pollForCompletion = async () => {
        console.log('[UPLOAD] 🔄 Starting aggressive fallback polling (every 3s for 30s)...');
        const startTime = Date.now();
        const maxWaitMs = 30000; // 30 seconds
        const pollIntervalMs = 3000; // 3 seconds

        while (Date.now() - startTime < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

          try {
            console.log('[UPLOAD] 📡 Checking file status via API...');
            const sessionData = await apiService.getSessionFiles(sessionId);

            if (sessionData && sessionData.files && sessionData.files.length > 0) {
              console.log('[UPLOAD] 📁 Files found:', sessionData.files.map(f => ({
                name: f.display_name || f.filename,
                status: f.status
              })));

              const allReady = sessionData.files.every(f =>
                ['indexed', 'processed', 'complete', 'uploaded'].includes(f.status)
              );

              if (allReady) {
                console.log('[UPLOAD] ✅ All files ready! Creating rows and navigating to sidebar...');

                // ✅ CRITICAL: Create rows with file names BEFORE navigating
                // This ensures the table has data even when WebSocket was disconnected
                sessionData.files.forEach(file => {
                  const displayName = file.display_name || file.filename;
                  if (displayName) {
                    const docCol = stateRef.current.columns.find(c => c.label === 'Document Name' || c.dataType === DataTypes.FILE);
                    const docColId = docCol ? docCol.id : 'Document Name';
                    const existingRow = stateRef.current.data.find(row => {
                      const raw = row[docColId] || row['Document Name'];
                      const text = typeof raw === 'object' ? (raw?.value || raw?.text) : raw;
                      return text === displayName;
                    });
                    if (!existingRow) {
                      const emptyRowIndex = stateRef.current.data.findIndex(row => {
                        const raw = row[docColId] || row['Document Name'];
                        const text = typeof raw === 'object' ? (raw?.value || raw?.text) : raw;
                        return !text || String(text).trim() === '';
                      });
                      if (emptyRowIndex >= 0) {
                        console.log(`[UPLOAD] Filling row ${emptyRowIndex + 1} for file: ${displayName}`);
                        dispatch({
                          type: ActionTypes.UPDATE_CELL,
                          rowIndex: emptyRowIndex,
                          columnId: docColId,
                          value: displayName
                        });
                      } else {
                        console.log(`[UPLOAD] Adding row for file: ${displayName}`);
                        const rowData = { 'Document Name': displayName };
                        rowData[docColId] = displayName;
                        dispatch({
                          type: ActionTypes.ADD_ROW,
                          rowData
                        });
                      }
                    }
                  }
                });

                // Update uploaded files state
                setUploadedFiles(sessionData.files);

                setUploadStatus('complete');
                setExtractionStatus('ready_for_extraction');
                setCurrentPage('sidebar');
                return; // Exit polling loop
              }
            }
          } catch (pollError) {
            console.warn('[UPLOAD] ⚠️ Poll check failed:', pollError);
          }
        }

        console.warn('[UPLOAD] ⏱️ Polling timeout. Files may not be indexed yet.');
        // Even if timeout, navigate to sidebar so user isn't stuck
        console.log('[UPLOAD] 🚀 Force navigating to sidebar after timeout...');
        setUploadStatus('complete');
        setCurrentPage('sidebar');

      };

      // Start fallback polling
      pollForCompletion();

      // ✅ NOTE: Original fallback removed. Using aggressive polling above.


    } catch (error) {
      logger.error('Upload failed:', error);
      setIsProcessing(false);
      setExtractionStatus('error');
      // Call error callback if provided
      if (callbacks.onError) {
        callbacks.onError(error);
      } else {
        alert(`Upload failed: ${error.message}`);
      }
    }
  };

  // Handle file upload (for extraction page)
  const handleFilesUploaded = async (files, onProgress) => {
    try {
      setIsProcessing(true);
      setExtractionStatus('uploading');

      // Upload files via API
      const result = await apiService.uploadFiles(sessionId, files, onProgress);
      logger.debug('Files uploaded:', result);

      // Extract fields from column headers
      const fields = state.columns.map(col => col.label).filter(label => label !== 'Column');
      setExtractionFields(fields);

      // Start extraction
      if (fields.length > 0) {
        setExtractionStatus('extracting');
        websocketService.startExtraction(fields);
      } else {
        alert('Please define column headers before starting extraction');
        setIsProcessing(false);
        setExtractionStatus('ready_for_extraction');
      }

    } catch (error) {
      logger.error('Upload failed:', error);
      setIsProcessing(false);
      setExtractionStatus('error');
      alert(`Upload failed: ${error.message}`);
    }
  };

  // Store chat callback ref
  const [chatResponseCallback, setChatResponseCallback] = React.useState(null);

  // ✅ NEW: Listen for Column Refine events from HeaderMenu
  // This routes column-specific queries to the main chat sidebar
  React.useEffect(() => {
    const handleRefine = (e) => {
      console.log('%c[REFINE_DEBUG] 🔥 triggerRefineQuery EVENT FIRED 🔥', 'color: red; font-size: 16px; font-weight: bold');
      const { query, columnId, columnName } = e.detail;
      console.log('[REFINE_DEBUG] webSearchEnabledRef.current:', webSearchEnabledRef.current);

      // ✅ FIX: Separate display message from backend message
      // User sees only their query in sidebar, backend gets full context
      const userDisplayQuery = query;  // What user typed, shown in sidebar
      const backendContextQuery = `Refine column "${columnName}": ${query}`;  // Full context for backend

      logger.debug('[REFINE] User query:', userDisplayQuery);
      logger.debug('[REFINE] Backend context:', backendContextQuery);

      // ✅ FIX 1: IMMEDIATE animation trigger using columnId (more reliable than name)
      setRefiningColumn(columnName);
      refiningColumnRef.current = columnName;

      if (columnId) {
        setUpdatingColumns(prev => {
          const next = new Set(prev);
          next.add(columnId);
          logger.debug('[REFINE] Animation started for columnId:', columnId);
          return next;
        });
      }

      // Trigger chat message handling via ref to avoid closure issues
      // ✅ Pass both: displayMessage for sidebar, backendMessage for processing
      // ✅ FIX: Include webSearchEnabled from global ref for column_query messages
      if (handleChatMessageRef.current) {
        console.log('%c[REFINE_DEBUG] ✅ Calling handleChatMessageRef.current with webSearchEnabled:', 'color: green; font-weight: bold', webSearchEnabledRef.current);
        handleChatMessageRef.current({
          message: backendContextQuery,  // Full context sent to backend
          displayMessage: userDisplayQuery,  // Only user's query shown in sidebar
          refineColumnId: columnId,
          webSearchEnabled: webSearchEnabledRef.current  // ✅ NEW: Pass current toggle state
        });
      } else {
        logger.error('[REFINE] handleChatMessageRef.current is NULL!');
      }

      // Ensure we switch to sidebar to show the interaction
      setCurrentPage('sidebar');
    };

    window.addEventListener('triggerRefineQuery', handleRefine);
    return () => {
      window.removeEventListener('triggerRefineQuery', handleRefine);
    };
  }, []); // Empty dependency array - consistent listener

  // ✅ EXPERT SOLUTION: Check backend health before sending query
  const handleChatMessage = async (data) => {
    console.log('%c[CHAT_MESSAGE_DEBUG] 🚀 handleChatMessage CALLED 🚀', 'color: blue; font-size: 16px; font-weight: bold');
    console.log('[CHAT_MESSAGE_DEBUG] data.webSearchEnabled:', data.webSearchEnabled);
    console.log('[CHAT_MESSAGE_DEBUG] webSearchEnabledRef.current:', webSearchEnabledRef.current);
    console.log('[CHAT_MESSAGE_DEBUG] websocketService.webSearchEnabled:', websocketService.webSearchEnabled);
    logger.debug('[USER QUERY]', data.message);

    // [REFINE] Detect refine intent from query - extract column name safely
    // This regex captures column name from patterns like 'Refine column "Revenue": ...' or 'refine Revenue: ...'
    const refineMatch = data.message.match(/refine\s+(?:column\s+)?["']?([^"':]+)["']?\s*:/i);
    if (refineMatch && refineMatch[1]) {
      const colName = refineMatch[1].trim();
      logger.debug('[REFINE] Detected intent for column:', colName);
      setRefiningColumn(colName);
      refiningColumnRef.current = colName;

      // ✅ IMMEDIATE ANIMATION TRIGGERS
      setUpdatingColumns(prev => {
        const next = new Set(prev);
        // Find column ID from label
        const col = stateRef.current.columns.find(c => c.label === colName || c.id === colName);
        if (col) {
          next.add(col.id);
          logger.debug('[REFINE] Added animation to column:', col.id);
        }
        return next;
      });
    }

    // ✅ REMOVED: The 90-second timeout was causing premature state clearing
    // Large files can take hours to process, so no timeout is better than a wrong timeout
    // The backend will send proper completion signals when done

    // Add user message (Canonical: role='user', content=message)
    // ✅ FIX: For refine, show only user's original query in sidebar (not the "Refine column" prefix)
    const sidebarDisplayMessage = data.displayMessage || data.message;
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${messageIdCounter.current++}`,
      content: sidebarDisplayMessage,
      role: 'user',
      timestamp: new Date()
    }]);

    // ✅ NEW: Save user message to Firestore
    const userId = urlParams.user || parentUserId || 'anonymous';
    saveMessageToFirestore(userId, sessionId, 'user', sidebarDisplayMessage);

    // ✅ Generate dynamic chat title from first user message using LLM
    if (chatTitle === 'New Research') {
      // Call LLM for title generation immediately (async, won't block UI)
      (async () => {
        try {
          console.log('[CHAT_TITLE] 🚀 Calling LLM to generate title...');
          const response = await fetch(`${API_BASE_URL}/data-extraction/generate-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sidebarDisplayMessage })
          });
          const result = await response.json();
          console.log('[CHAT_TITLE] LLM response:', result);
          if (result.title) {
            setChatTitle(result.title);
            console.log('[CHAT_TITLE] ✅ Title updated to:', result.title);

            // ✅ NEW: Notify parent of title update for live sidebar refresh
            if (window.parent !== window) {
              window.parent.postMessage({
                type: 'titleUpdated',
                sessionId: sessionId,
                title: result.title
              }, '*');
              console.log('📢 [SESSION] Notified parent of title update:', result.title);
            }

            // ✅ FIXED: CREATE session in Firestore with dynamic title (not update)
            try {
              const userId = urlParams.user || 'anonymous';
              console.log(`🔥 [FIRESTORE] Creating session with title: "${result.title}"`);
              await fetch(`${SESSION_SERVICE_URL}/sessions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
                },
                body: JSON.stringify({
                  userId: userId,
                  sessionId: sessionId,
                  title: result.title,
                  agentType: AGENT_TYPE
                })
              });
              console.log('✅ [FIRESTORE] Session created with dynamic title');
            } catch (firestoreError) {
              console.warn('⚠️ Could not save session to Firestore:', firestoreError);
            }
          }
        } catch (error) {
          console.error('[CHAT_TITLE] ❌ LLM call failed:', error);
          // Fallback to simple text extraction only if API completely fails
          const words = sidebarDisplayMessage.trim().split(/\s+/).slice(0, 5);
          let fallbackTitle = words.join(' ');
          if (fallbackTitle.length > 35) {
            fallbackTitle = fallbackTitle.substring(0, 35).trim() + '...';
          }
          const finalTitle = fallbackTitle.charAt(0).toUpperCase() + fallbackTitle.slice(1);
          setChatTitle(finalTitle);

          // ✅ NEW: Notify parent of fallback title update for live sidebar refresh
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'titleUpdated',
              sessionId: sessionId,
              title: finalTitle
            }, '*');
            console.log('📢 [SESSION] Notified parent of fallback title:', finalTitle);
          }

          // ✅ FIXED: CREATE session with fallback title
          try {
            const userId = urlParams.user || 'anonymous';
            await fetch(`${SESSION_SERVICE_URL}/sessions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
              },
              body: JSON.stringify({
                userId: userId,
                sessionId: sessionId,
                title: finalTitle,
                agentType: AGENT_TYPE
              })
            });
          } catch (e) { /* ignore */ }
        }
      })();
    }

    // Switch to sidebar view immediately
    setCurrentPage('sidebar');

    // ✅ FIX: Check if query is conversational - don't show "Analyzing query" for casual chat
    const conversationalKeywords = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'how are you', 'goodbye', 'bye'];
    const isConversational = conversationalKeywords.some(keyword => data.message.toLowerCase().trim().includes(keyword));

    // NEW: Use thinking indicator instead of isProcessing
    setIsThinking(true);
    setIsChatTyping(true); // ✅ FIX: Enable thinking animation in Sidebar
    setThinkingMessage(isConversational ? "Responding..." : "Analyzing your query...");
    // ✅ Track if this is a refine operation (to skip all-columns animation)
    const isRefineOperation = refineMatch && refineMatch[1];

    // ✅ IMMEDIATE ANIMATION: Only for NEW extractions (not refine operations)
    // Refine operations should only animate the target column (already done above)
    if (!isConversational && !isRefineOperation) {
      logger.debug('[UI] Triggering immediate extraction animation for ALL columns');

      // 1. Ensure we have at least 10 columns (excluding system columns)
      const systemColumns = ['selection', 'Document Name', 'add_column'];
      const dataColumns = stateRef.current.columns.filter(c => !systemColumns.includes(c.id));
      const columnsNeeded = 10 - dataColumns.length;

      if (columnsNeeded > 0) {
        for (let i = 0; i < columnsNeeded; i++) {
          dispatch({ type: ActionTypes.ADD_COLUMN });
        }
      }

      // ✅ DISABLED: Old animation triggering - now controlled by backend extraction_targeting signal
      // The SET_EXTRACTING_CELLS reducer handles targeted animation based on backend's target_files/target_columns
      // This ensures only the correct rows (e.g., "new file only") are animated
      /*
      // 2. Set "Extracting..." for first 10 data columns in RELEVANT rows only
      setTimeout(() => {
        const currentCols = stateRef.current.columns.filter(c => !systemColumns.includes(c.id)).slice(0, 10);
        const currentRows = stateRef.current.data;
        currentCols.forEach(col => {
          currentRows.forEach((row, rIndex) => {
            const docName = row['Document Name'];
            if (docName && String(docName).trim() !== '') {
              dispatch({
                type: ActionTypes.UPDATE_CELL,
                rowIndex: rIndex,
                columnId: col.id,
                value: 'Extracting...'
              });
            }
          });
        });
        setUpdatingColumns(prev => {
          const next = new Set(prev);
          currentCols.forEach(col => {
            next.add(col.id);
          });
          return next;
        });
      }, 50);
      */
    } else if (isRefineOperation) {
      logger.debug('[REFINE] Skipping all-columns animation - only target column will be updated');
      // For refine: Set "Extracting..." ONLY for the target column
      const systemColumns = ['selection', 'Document Name', 'add_column'];
      const colName = refineMatch[1].trim();
      const targetCol = stateRef.current.columns.find(c => c.label === colName || c.id === colName);

      if (targetCol) {
        setTimeout(() => {
          const currentRows = stateRef.current.data;
          currentRows.forEach((row, rIndex) => {
            const docName = row['Document Name'];
            if (docName && String(docName).trim() !== '') {
              dispatch({
                type: ActionTypes.UPDATE_CELL,
                rowIndex: rIndex,
                columnId: targetCol.id,
                value: 'Extracting...'
              });
            }
          });
        }, 50);
      }
    }


    // ✅ ENHANCED: Check chat WebSocket connection before sending query
    logger.debug('[HANDLE_CHAT] Checking connection. isConnected:', websocketService.isConnected(), 'WS readyState:', websocketService.ws?.readyState);

    // ✅ FIX: Use main websocketService for consistent sessionId handling
    // chatWebsocketService was causing sessionId=null issues
    if (!websocketService.isConnected()) {
      logger.warn('[HANDLE_CHAT] WS not connected, attempting reconnect...');
      await websocketService.ensureConnected(sessionId, urlParams.user || 'anonymous');

      if (!websocketService.isConnected()) {
        logger.error('[HANDLE_CHAT] WS reconnect failed!');
        setIsThinking(false);
        setIsChatTyping(false);
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}-${messageIdCounter.current++}`,
          content: '⚠️ Not connected. Reconnecting... Please try again in a moment.',
          role: 'system',
          timestamp: new Date(),
          shouldAnimate: true,
          typingComplete: false
        }]);
        return;
      }
      logger.debug('[HANDLE_CHAT] WS reconnected successfully!');
    }

    try {
      // Check backend health to see if Vertex AI is ready
      logger.debug('[HEALTH CHECK] Checking backend readiness...');
      const health = await apiService.checkDataExtractionHealth();
      logger.debug('[HEALTH CHECK] Backend status:', health);

      if (health.status === 'initializing' || health.vertex_ai?.status === 'IN_PROGRESS') {
        // Backend is still initializing - inform user
        const elapsed = health.vertex_ai?.elapsed_seconds || 0;
        setIsThinking(false);
        setIsChatTyping(false); // ✅ FIX: Disable thinking animation
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}-${messageIdCounter.current++}`,
          content: `⏳ AI is still initializing... (${Math.floor(elapsed)}s elapsed)\n\nPlease wait a moment and try again.`,
          role: 'system',
          timestamp: new Date(),
          shouldAnimate: true,
          typingComplete: false
        }]);
        return;
      }

      if (health.status === 'degraded' || health.vertex_ai?.status === 'FAILED') {
        // Backend initialization failed
        const error = health.vertex_ai?.error || 'Unknown error';
        setIsThinking(false);
        setIsChatTyping(false); // ✅ FIX: Disable thinking animation
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}-${messageIdCounter.current++}`,
          content: `❌ AI service failed to initialize:\n\n${error}\n\nPlease check backend logs and restart the server.`,
          role: 'system',
          timestamp: new Date(),
          shouldAnimate: true,
          typingComplete: false
        }]);
        return;
      }

      // Backend is ready - send query (with auto-reconnect!)
      logger.debug('==========================================');
      logger.debug('[SENDING TO BACKEND] Raw query:', data.message);
      logger.debug('[WEB_SEARCH_TOGGLE] Enabled:', data.webSearchEnabled !== undefined ? data.webSearchEnabled : true);
      logger.debug('[WS_STATE] isConnected:', websocketService.isConnected(), 'readyState:', websocketService.ws?.readyState);
      // ✅ FIX: Use main websocketService for extraction queries
      // This ensures sessionId is always correct
      // ✅ CRITICAL FIX: Use webSearchEnabledRef.current as fallback, NOT hardcoded true
      const effectiveWebSearch = data.webSearchEnabled !== undefined ? data.webSearchEnabled : webSearchEnabledRef.current;
      logger.debug('[WEB_SEARCH_TOGGLE] 🔍 Sending to backend:', effectiveWebSearch, '(from data:', data.webSearchEnabled, ', ref:', webSearchEnabledRef.current, ')');

      let sendResult = await websocketService.sendWithReconnect({
        type: 'extraction_query',
        query: data.message,
        session_id: sessionId,
        enable_web_search: effectiveWebSearch,
        table_context: buildTableContext()
      });

      logger.debug('[SEND_RESULT]', sendResult ? 'SUCCESS' : 'FAILED');
      logger.debug('==========================================');

      if (!sendResult) {
        setIsThinking(false);
        setIsChatTyping(false);
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}-${messageIdCounter.current++}`,
          content: '❌ Connection lost. Please refresh the page and try again.',
          role: 'system',
          timestamp: new Date()
        }]);
        return;
      }

      // No timeout - extraction continues until complete or explicit error
      const progressMessages = [
        "Analyzing your query...",
        "Extracting data from files...",
        "Large files may take longer...",
        "Processing the uploaded documents...",
        "Almost there, please wait...",
        "Searching for relevant information...",
        "Parsing document structure...",
        "Validating extracted values..."
      ];

      let messageIndex = 0;
      const messageInterval = setInterval(() => {
        // Only update if still thinking
        if (isThinking || isChatTyping) {
          setThinkingMessage(progressMessages[messageIndex % progressMessages.length]);
          messageIndex++;
        }
      }, 5000); // Rotate message every 5 seconds

      // Store interval ID to clear it when response arrives
      window.currentQueryInterval = messageInterval;

    } catch (error) {
      logger.error('[HEALTH CHECK ERROR]', error);
      setIsThinking(false);
      setIsChatTyping(false); // ✅ FIX: Disable thinking animation
      setChatMessages(prev => [...prev, {
        id: `msg-${Date.now()}-${messageIdCounter.current++}`,
        content: `**Connection Error**\n\nCouldn't connect to backend server.\n\n**What to do:**\n- Check if backend is running\n- Verify the backend URL is correct\n- Check your network connection`,
        role: 'system',
        timestamp: new Date(),
        shouldAnimate: true,
        typingComplete: false
      }]);
    }
  };

  // ✅ NEW: Handle stop button click - cancel the current query
  const handleStopQuery = useCallback(() => {
    logger.important('[STOP_QUERY] User clicked stop button');

    // 1. Clear all thinking states
    setIsThinking(false);
    setIsChatTyping(false);
    setThinkingMessage('');

    // 2. Clear any pending message intervals
    if (window.currentQueryInterval) {
      clearInterval(window.currentQueryInterval);
      window.currentQueryInterval = null;
    }

    // 3. Clear updating animations
    setUpdatingColumns(new Set());

    // 4. Send stop signal to backend
    try {
      websocketService.send({
        type: 'stop_query',
        session_id: sessionId
      });
      logger.info('[STOP_QUERY] Sent stop signal to backend');
    } catch (error) {
      logger.warn('[STOP_QUERY] Could not send stop signal:', error);
    }

    // 5. Add system message about cancellation
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${messageIdCounter.current++}`,
      content: 'Query stopped by user.',
      role: 'system',
      timestamp: new Date()
    }]);
  }, [sessionId]);

  // ✅ CRITICAL FIX: Use useLayoutEffect for SYNCHRONOUS ref assignment
  // This ensures handleChatMessageRef.current is populated BEFORE paint and BEFORE event handlers
  // The previous useEffect ran AFTER event handlers registered, causing null ref when refine clicked quickly
  React.useLayoutEffect(() => {
    logger.debug('[REF_ASSIGNMENT] Assigning handleChatMessageRef.current (useLayoutEffect)');
    handleChatMessageRef.current = handleChatMessage;
  }, [handleChatMessage]);

  // ✅ NEW: Listen to Chat & File Events
  // This wires up the sidebar updates which were previously missing
  React.useEffect(() => {
    // Register event listeners on Chat Service
    const listeners = {
      'chat_chunk': handleChatChunk,
      'chat_complete': handleChatComplete,
      'file_card': handleFileCard,
      'modification_preview': handleColumnModificationPreview
    };

    Object.entries(listeners).forEach(([event, handler]) => {
      chatWebsocketService.on(event, handler);
      websocketService.on(event, handler); // Listen on main WS too as fallback
    });

    return () => {
      Object.entries(listeners).forEach(([event, handler]) => {
        chatWebsocketService.off(event, handler);
        websocketService.off(event, handler);
      });
    };
  }, []); // Run once on mount


  const handleFieldLimitResponse = (response) => {
    // Send response to backend
    websocketService.send({
      type: 'field_limit_response',
      response: response
    });

    // Close modal
    setShowFieldLimitModal(false);
    setFieldLimitData(null);

    // Resume thinking
    setIsThinking(true);
    setThinkingMessage(response === 'yes' ? "Extracting all fields..." : "Extracting first 20 fields...");
  };

  // ✅ NEW: Chat WebSocket Handlers for LangChain Agent
  // Handle simple chat messages (from sidebar input)
  const handleSendChatMessage = async (message) => {
    // [COMMENT 2] Use Chat WS with auto-reconnect
    if (!sessionId) {
      alert('No active session. Please upload a file first.');
      return;
    }

    // Optimistic UI update
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${messageIdCounter.current++}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    }]);

    setIsChatTyping(true);

    try {
      // Get Firebase Token for secure connection
      let token = null;
      if (user) {
        try {
          token = await user.getIdToken();
          console.log('[App] 🔐 Generated Firebase Token for WebSocket');
        } catch (err) {
          console.error('[App] ⚠️ Failed to get token:', err);
        }
      }

      const sent = await chatWebsocketService.sendWithReconnect({
        type: 'chat_message',
        message: message,
        session_id: sessionId
      });

      if (!sent) {
        throw new Error('Could not send message after reconnection attempts');
      }

    } catch (error) {
      console.error('Failed to send chat message:', error);
      setIsChatTyping(false);
      setChatMessages(prev => [...prev, {
        id: `msg-${Date.now()}-${messageIdCounter.current++}`,
        content: '⚠️ Connection lost. Please wait a moment and try again.',
        role: 'system',
        timestamp: new Date()
      }]);
    }
  };

  const handleChatChunk = (data) => {
    setChatMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.sender === 'ai' && !last.complete) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: last.text + data.content }
        ];
      } else {
        return [...prev, {
          id: `msg-${Date.now()}-${messageIdCounter.current++}`,
          sender: 'ai',
          text: data.content,
          timestamp: new Date(),
          complete: false
        }];
      }
    });
  };

  const handleChatComplete = (data) => {
    setChatMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.sender === 'ai') {
        return [
          ...prev.slice(0, -1),
          { ...last, complete: true }
        ];
      }
      return prev;
    });
    setIsChatTyping(false);
  };

  const handleFileCard = (data) => {
    logger.debug('[FILE_CARD] Received:', data);
    const fileInfo = {
      id: data.file_id,
      filename: data.filename,
      page_count: data.page_count,
      pageCount: data.page_count,
      size: data.size,
      summary: data.summary,
      uploadTime: data.upload_time
    };

    setUploadedFiles(prev => {
      if (prev.some(f => f.id === fileInfo.id || f.filename === fileInfo.filename)) {
        return prev;
      }
      return [...prev, fileInfo];
    });
  };

  const handleColumnModificationPreview = (data) => {
    logger.debug('[MOD_PREVIEW] Received:', data);
    setPendingModification({
      id: data.modification_id,
      oldColumn: data.old_column,
      newColumn: data.new_column,
      newData: data.new_data,
      message: data.message
    });
  };

  const handleApplyColumnModification = (data) => {
    const { old_column, new_column, new_data } = data;
    logger.debug(`[MODIFY] Applying: ${old_column} → ${new_column}`);

    const columnToUpdate = state.columns.find(c => c.label === old_column);
    if (columnToUpdate) {
      dispatchWithHistory({
        type: ActionTypes.UPDATE_COLUMN_HEADER,
        columnId: columnToUpdate.id,
        label: new_column
      });

      if (new_data) {
        Object.keys(new_data).forEach((filename) => {
          const cellData = new_data[filename];
          const rowIndex = state.data.findIndex(row =>
            row['Document Name'] === filename || row['document_name'] === filename
          );

          if (rowIndex >= 0 && cellData && cellData.extracted_data) {
            dispatchWithHistory({
              type: ActionTypes.UPDATE_CELL,
              rowIndex,
              columnId: columnToUpdate.id,
              value: cellData.extracted_data
            });
          }
        });
      }
    }

    setPendingModification(null);
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${messageIdCounter.current++}`,
      sender: 'system',
      text: `✓ Column updated from '${old_column}' to '${new_column}'`,
      timestamp: new Date()
    }]);
  };

  const handleDiscardColumnModification = () => {
    logger.debug('[MODIFY] Discarded');
    setPendingModification(null);
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${messageIdCounter.current++}`,
      sender: 'system',
      text: '✗ Modification cancelled. Original column preserved.',
      timestamp: new Date()
    }]);
  };

  const handleAcceptModification = () => {
    if (!websocketService || !pendingModification) return;
    logger.debug('[ACCEPT] Sending accept to agent');
    websocketService.send({
      type: 'chat_message',
      message: 'accept'
    });
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${messageIdCounter.current++}`,
      sender: 'user',
      text: 'Accept',
      timestamp: new Date()
    }]);
  };

  const handleRejectModification = () => {
    if (!websocketService || !pendingModification) return;
    logger.debug('[REJECT] Sending reject to agent');
    websocketService.send({
      type: 'chat_message',
      message: 'reject'
    });
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}-${messageIdCounter.current++}`,
      sender: 'user',
      text: 'Reject',
      timestamp: new Date()
    }]);
  };

  // Render based on current page state

  // ✅ NEW: Show loading screen while restoring session
  if (isRestoringSession) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white">
        <style>{`
          .circle-loader {
            --path: #d1d5db;
            --dot: #3B82F6;
            --duration: 3s;
            width: 44px;
            height: 44px;
            position: relative;
          }
          .circle-loader:before {
            content: "";
            width: 6px;
            height: 6px;
            border-radius: 50%;
            position: absolute;
            display: block;
            background: var(--dot);
            top: 3px;
            left: 19px;
            transform-origin: 3px 19px;
            transform: rotate(-90deg);
            animation: dotCircle var(--duration) cubic-bezier(0.785, 0.135, 0.15, 0.86) infinite;
          }
          .circle-loader svg {
            display: block;
            width: 100%;
            height: 100%;
          }
          .circle-loader svg circle {
            fill: none;
            stroke: var(--path);
            stroke-width: 10px;
            stroke-linejoin: round;
            stroke-linecap: round;
            stroke-dasharray: 150 50 150 50;
            stroke-dashoffset: 75;
            animation: pathCircle var(--duration) cubic-bezier(0.785, 0.135, 0.15, 0.86) infinite;
          }
          @keyframes pathCircle {
            25% { stroke-dashoffset: 125; }
            50% { stroke-dashoffset: 175; }
            75% { stroke-dashoffset: 225; }
            100% { stroke-dashoffset: 275; }
          }
          @keyframes dotCircle {
            0% { transform: rotate(-90deg); }
            25% { transform: rotate(-180deg); }
            50% { transform: rotate(-270deg); }
            75% { transform: rotate(-360deg); }
            100% { transform: rotate(-450deg); }
          }
        `}</style>
        <div className="flex flex-col items-center gap-5">
          <div className="circle-loader">
            <svg viewBox="0 0 80 80">
              <circle r={32} cy={40} cx={40} />
            </svg>
          </div>
          <p className="text-sm text-gray-400 font-medium tracking-wide">Just a moment...</p>
        </div>
      </div>
    );
  }

  // 1. File upload page
  if (currentPage === 'upload') {
    return (
      <FileUploadPage
        onFilesProcessed={handleFilesProcessed}
        sessionId={sessionId}
        processingStatus={uploadStatus} // ✅ Pass status to control UI state
        onViewData={() => setCurrentPage('sidebar')} // ✅ Allow manual navigation to data
      />
    );
  }

  // 2. Chat in center (after upload)
  if (currentPage === 'chat') {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ maxWidth: '900px', width: '100%', padding: '20px' }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: '2rem',
            color: '#1f2937'
          }}>
            What would you like to know?
          </h1>
          <AIChatInput
            onSendMessage={handleChatMessage}
            onStopQuery={handleStopQuery}
            onWebSearchToggle={(enabled) => {
              console.log('%c[WEB_SEARCH_TOGGLE] 🔄 Toggle changed to:', 'color: purple; font-weight: bold', enabled);
              webSearchEnabledRef.current = enabled;  // ✅ Sync global ref
              // ✅ CRITICAL: Sync BOTH WebSocket services so ALL messages include this state
              websocketService.setWebSearchEnabled(enabled);
              chatWebsocketService.setWebSearchEnabled(enabled);
            }}
            isUploading={uploadStatus === 'uploading' || uploadStatus === 'processing'}
            isProcessing={isThinking || isChatTyping}
            uploadProgress={0}
            onFileUpload={async (files) => {
              logger.debug('[ATTACH] Files selected:', files);
              setUploadStatus('uploading');
              try {
                const response = await apiService.uploadFiles(sessionId, files);
                logger.debug('[ATTACH] Upload to server complete, now processing:', response);

                // Handle different response structures
                const uploadedFilesList = response?.files || response?.uploaded_files || [];

                // Only update if we have valid files array
                if (Array.isArray(uploadedFilesList) && uploadedFilesList.length > 0) {
                  setUploadedFiles(prev => [...prev, ...uploadedFilesList]);

                  // Populate sessionFilesMap for files uploaded via chat attach
                  setSessionFilesMap(prevMap => {
                    const newMap = new Map(prevMap);
                    uploadedFilesList.forEach(file => {
                      const displayName = file.display_name || file.filename || file.name;
                      const actualFilename = file.file_path ? file.file_path.split('/').pop() : (file.filename || file.name);
                      if (displayName && actualFilename) {
                        newMap.set(displayName, actualFilename);
                      }
                    });
                    logger.debug('[FILES_MAP] Merged chat-attach files:', Object.fromEntries(newMap));
                    return newMap;
                  });
                } else {
                  logger.warn('[ATTACH] No files in response or unexpected format:', response);
                }

                // Set to 'processing' - WebSocket will set 'complete' when files are fully processed
                // The handleUploadComplete handler in useExtractionWebSocket.js listens for 'upload_complete'
                setUploadStatus('processing');
                logger.debug('[ATTACH] Status set to processing, waiting for WebSocket upload_complete signal...');

              } catch (error) {
                logger.error('[ATTACH ERROR]', error);
                setUploadStatus('error');
                setTimeout(() => setUploadStatus('idle'), 3000);
              }
            }}
          />
        </div>
      </div>
    );
  }

  // 3. Loading state (Initial only)
  // ✅ FIX: Prevent "Thinking..." overlay from blocking table during refine/chat
  if (currentPage === 'loading' && uploadedFiles.length === 0) {
    return <AILoader text="Generating" />;
  }

  // 4. Sidebar layout (Chat + Data Table)
  return (
    <SourceViewerContext.Provider value={{ openSourceViewer }}>
      <ErrorBoundary>
        <div style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          backgroundColor: '#f9fafb'
        }}>
          {/* Left Sidebar - New Chat Interface (Resizable) */}
          <ResizableSidebar initialWidth={480} minWidth={320} maxWidth={800}>
            <Sidebar
              sessionId={sessionId}
              onSendChatMessage={handleChatMessage}
              onStopQuery={handleStopQuery}
              conversationHistory={chatMessages}
              uploadedFiles={uploadedFiles}
              pendingModification={pendingModification}
              onAcceptModification={handleAcceptModification}
              onRejectModification={handleRejectModification}
              isChatTyping={isChatTyping}
              thinkingMessage={thinkingMessage}
              extractionLogs={extractionLogs}
              uploadStatus={uploadStatus}
              chatTitle={chatTitle}
              onWebSearchToggle={(enabled) => {
                // ✅ CRITICAL: This connects sidebar toggle to global state
                console.log('%c[WEB_SEARCH_TOGGLE] 🔄 Sidebar toggle changed to:', 'color: purple; font-weight: bold', enabled);
                webSearchEnabledRef.current = enabled;
                websocketService.setWebSearchEnabled(enabled);
                chatWebsocketService.setWebSearchEnabled(enabled);
              }}
              onFileUpload={async (files) => {
                // Same logic as main chat file upload
                logger.debug('[SIDEBAR ATTACH] Files selected:', files);
                console.log('[SIDEBAR ATTACH] Session ID:', sessionId);
                setUploadStatus('uploading');
                try {
                  const response = await apiService.uploadFiles(sessionId, files);
                  console.log('[SIDEBAR ATTACH] Full API response:', JSON.stringify(response, null, 2));
                  logger.debug('[SIDEBAR ATTACH] Upload complete, processing:', response);

                  const uploadedFilesList = response?.files || response?.uploaded_files || [];
                  console.log('[SIDEBAR ATTACH] Files list extracted:', uploadedFilesList);

                  if (Array.isArray(uploadedFilesList) && uploadedFilesList.length > 0) {
                    // Add to uploaded files list
                    setUploadedFiles(prev => [...prev, ...uploadedFilesList]);

                    // Find first empty row to use (instead of adding at bottom)
                    const docCol = stateRef.current.columns.find(c => c.label === 'Document Name' || c.dataType === DataTypes.FILE);
                    const docColId = docCol ? docCol.id : 'Document Name';

                    uploadedFilesList.forEach((file, idx) => {
                      const displayName = file.display_name || file.filename || file.name;
                      const actualFilename = file.file_path ? file.file_path.split('/').pop() : (file.filename || file.name);

                      console.log('[SIDEBAR ATTACH] Processing file:', { displayName, actualFilename, file });

                      // Add to session files map
                      if (displayName && actualFilename) {
                        setSessionFilesMap(prevMap => {
                          const newMap = new Map(prevMap);
                          newMap.set(displayName, actualFilename);
                          return newMap;
                        });
                      }

                      // Find first empty row (no Document Name)
                      const emptyRowIndex = stateRef.current.data.findIndex(
                        (row, i) => !row[docColId] && !row['Document Name']
                      );

                      if (emptyRowIndex !== -1) {
                        // Use the empty row - update it with the file name
                        console.log('[SIDEBAR ATTACH] Using empty row index:', emptyRowIndex, 'for file:', displayName);
                        dispatch({
                          type: ActionTypes.UPDATE_CELL,
                          columnId: docColId,
                          rowIndex: emptyRowIndex,
                          value: displayName
                        });
                      } else {
                        // No empty rows, add new row
                        // ✅ FIX: Use docColId as key, not hardcoded 'Document Name'
                        const newRowData = {};
                        newRowData[docColId] = displayName;
                        newRowData['Document Name'] = displayName; // Also set string key for backup
                        console.log('[SIDEBAR ATTACH] No empty rows, adding new row for:', displayName, 'with docColId:', docColId);
                        dispatch({
                          type: ActionTypes.ADD_ROW,
                          rowData: newRowData
                        });
                      }

                      logger.debug('[SIDEBAR ATTACH] Added file to table:', displayName);
                    });
                  } else {
                    console.warn('[SIDEBAR ATTACH] No files in response!', { rawResponse: response });
                  }

                  // Keep status as 'processing' - WebSocket indexingComplete will set to 'complete'
                  // This shows the pause button while file is being indexed
                  setUploadStatus('processing');
                  console.log('[SIDEBAR ATTACH] Status set to processing, waiting for indexingComplete...');

                  // Fallback timeout in case WebSocket is disconnected and can't receive indexingComplete
                  // After 30 seconds, assume processing is done
                  setTimeout(() => {
                    if (uploadStatus === 'processing') {
                      console.log('[SIDEBAR ATTACH] Fallback: 30s timeout, setting status to complete');
                      setUploadStatus('complete');
                      setTimeout(() => setUploadStatus('idle'), 2000);
                    }
                  }, 30000);

                } catch (error) {
                  logger.error('[SIDEBAR ATTACH ERROR]', error);
                  setUploadStatus('error');
                  setTimeout(() => setUploadStatus('idle'), 3000);
                }
              }}
            />
          </ResizableSidebar>

          {/* Right Side - Data Table */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#fafafa' }}>
            {/* Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e0e0e0',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{
                fontSize: '1.125rem',
                color: '#1a1a1a',
                letterSpacing: '-0.01em',
                marginBottom: 0
              }}>
                Extracted Data
              </h2>



              {/* ✅ Download buttons - CSV and PDF */}
              {/* Field Limit Confirmation Modal */}
              {showFieldLimitModal && fieldLimitData && (
                <div className="modal-overlay" onClick={() => handleFieldLimitResponse('no')}>
                  <div className="modal-content field-limit-modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                      <h3>⚠️ High Field Count Detected</h3>
                      <button className="close-button" onClick={() => handleFieldLimitResponse('no')}>×</button>
                    </div>

                    <div className="modal-body">
                      <p>
                        I found <strong>{fieldLimitData.total_count}</strong> potential data fields, which is quite a lot!
                        Extracting all of them might take longer and clutter your table.
                      </p>

                      <div className="field-preview-section">
                        <h4>First 20 fields (will be extracted):</h4>
                        <div className="field-tags">
                          {fieldLimitData.first_20_fields.map((field, idx) => (
                            <span key={idx} className="field-tag">{field}</span>
                          ))}
                        </div>
                      </div>

                      <div className="field-preview-section remaining">
                        <h4>Remaining {fieldLimitData.remaining_fields.length} fields:</h4>
                        <div className="field-tags faded">
                          {fieldLimitData.remaining_fields.slice(0, 10).map((field, idx) => (
                            <span key={idx} className="field-tag">{field}</span>
                          ))}
                          {fieldLimitData.remaining_fields.length > 10 && (
                            <span className="field-tag more">+{fieldLimitData.remaining_fields.length - 10} more...</span>
                          )}
                        </div>
                      </div>

                      <p className="confirmation-question">
                        Do you want to extract <strong>ALL {fieldLimitData.total_count} fields</strong>, or stop at the first 20?
                      </p>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="secondary-button"
                        onClick={() => handleFieldLimitResponse('no')}
                      >
                        Stop at 20 Fields
                      </button>
                      <button
                        className="primary-button"
                        onClick={() => handleFieldLimitResponse('yes')}
                      >
                        Yes, Extract All
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {state.data.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                  {/* Excel Download Dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const dropdown = e.currentTarget.nextElementSibling;
                        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#166534', // Green for Excel
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#14532d';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#166534';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Excel Icon */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 3.5L18.5 8H14V3.5zM8.5 18L7 16.5l2-2.5-2-2.5 1.5-1.5 2 2.5 2-2.5 1.5 1.5-2 2.5 2 2.5-1.5 1.5-2-2.5-2 2.5z" />
                      </svg>
                      Excel
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    <div
                      style={{
                        display: 'none',
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        border: '1px solid #e5e7eb',
                        overflow: 'hidden',
                        zIndex: 1000,
                        minWidth: '200px'
                      }}
                      onClick={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    >
                      {/* Option 1: Without Analysis */}
                      <button
                        onClick={() => downloadAsExcel(state.data, state.columns, false, 'oriplex_data.xlsx')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          color: '#374151',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Data Only</span>
                      </button>

                      {/* Divider */}
                      <div style={{ height: '1px', backgroundColor: '#e5e7eb' }}></div>

                      {/* Option 2: With Analysis */}
                      <button
                        onClick={() => downloadAsExcel(state.data, state.columns, true, 'oriplex_data_with_analysis.xlsx')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          color: '#374151',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>With Analysis</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Table */}
            <div
              ref={tableContainerRef}
              className="table-container"
              style={{
                flex: 1,
                overflow: 'auto',
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                margin: '16px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                scrollBehavior: 'smooth'
              }}>
              <TableV8
                  key={`v8-${schemaVersion}`}
                  columns={state.columns}
                  data={state.data}
                  dispatch={dispatchWithHistory}
                  skipReset={state.skipReset}
                  updatingColumns={updatingColumns}
                />
            </div>
          </div>

          <div id="popper-portal"></div>
        </div>
      </ErrorBoundary>

      {/* Source Viewer Modal */}
      <SourceViewer
        isOpen={sourceViewerOpen}
        onClose={() => setSourceViewerOpen(false)}
        source={currentSource}
        highlightValue={highlightValue}
      />
      {/* PDF Viewer Sidebar */}
      {pdfViewerOpen && <Suspense fallback={<div>Loading document...</div>}><PDFViewer
        isOpen={pdfViewerOpen}
        onClose={() => setPdfViewerOpen(false)}
        filename={pdfViewerData.filename}
        chunkText={pdfViewerData.chunkText}
        citations={pdfViewerData.citations}
        sessionId={pdfViewerData.sessionId}
        sessionFilesMap={sessionFilesMap}  // ✅ NEW: Pass mapping for filename resolution
      /></Suspense>}
    </SourceViewerContext.Provider>
  );
}

export default App;
