import React, { useEffect, useState, useRef } from 'react';
import ContentEditable from 'react-contenteditable';
import { ActionTypes } from '../utils';
import CellModal from '../components/CellModal';
import Badge from '../Badge';
import { useSourceViewer } from '../AppContext';

// Comment 6: Standard constant
const PLACEHOLDER_VALUE = "Extracting...";

export default function TextCell({
  initialValue,
  columnId,
  rowIndex,
  dataDispatch,
  isUpdating, // ✅ Receive isUpdating
}) {
  const context = useSourceViewer();
  const openSourceViewer = context?.openSourceViewer;

  // Handle both string and object values
  const parseValue = (val) => {
    // Handle structured cell objects { value, citations, reasoning, badge }
    if (val && typeof val === 'object' && val.value !== undefined && val.text === undefined) {
      return {
        text: String(val.value || ''), // ✅ CRITICAL: Coerce to string
        citations: val.citations || [],
        badge: val.badge || null,
        reasoning: val.reasoning || null,
        is_placeholder: val.is_placeholder || false
      };
    }

    if (val && typeof val === 'object' && val.text !== undefined) {
      return {
        ...val,
        text: String(val.text || ''), // ✅ CRITICAL: Coerce to string
        citations: val.citations || [],
        reasoning: val.reasoning || null
      };
    }

    // ✅ CRITICAL FIX: Always return string for text field
    const parsed = {
      text: '',
      citations: [],
      badge: null,
      reasoning: null
    };

    try {
      // ✅ FIX: Check if val is an object and extract useful content
      if (val && typeof val === 'object') {
        // Try to extract value, text, or content from object
        const textValue = val.value || val.text || val.content || val.extracted_value || '';
        if (textValue) {
          parsed.text = String(textValue);
          parsed.citations = val.citations || [];
          parsed.reasoning = val.reasoning || null;
          parsed.badge = val.badge || null;
        } else {
          // Object has no useful text property - use JSON stringification
          parsed.text = JSON.stringify(val) || '';
        }
      } else {
        // Handles primitives, null, undefined
        parsed.text = String(val || '');
      }
    } catch (e) {
      console.warn('[TextCell] String coercion failed:', e);
      parsed.text = JSON.stringify(val) || '';
    }

    return parsed;
  };

  const [value, setValue] = useState({ ...parseValue(initialValue), update: false });
  const [isSelected, setIsSelected] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const cellRef = useRef(null);

  // Sync with initialValue prop changes
  useEffect(() => {
    // [DEBUG] Log value updates
    if (initialValue && typeof initialValue === 'string' && !initialValue.includes('Extracting')) {
      console.log(`[TextCell] Received Update [Row ${rowIndex}, Col ${columnId}]:`, initialValue);
    }
    setValue({ ...parseValue(initialValue), update: false });
  }, [initialValue, rowIndex, columnId]);

  // NEW: Force re-render when animation stops
  useEffect(() => {
    if (!isUpdating) {
      const isPlaceholder =
        value.text === PLACEHOLDER_VALUE ||
        value.is_placeholder === true ||
        (typeof value.text === 'string' && value.text.includes('Extracting'));

      if (isPlaceholder) {
        setValue({ ...parseValue(initialValue), update: false });
      }
    }
  }, [isUpdating, value.text, value.is_placeholder, initialValue]);

  // Get raw content - with defensive object handling
  let contentString = '';
  if (value.text) {
    if (typeof value.text === 'object') {
      // ✅ FIX: If text is still an object, extract useful content or stringify
      contentString = value.text.text || value.text.value || value.text.content || JSON.stringify(value.text);
    } else {
      contentString = value.text.toString();
    }
  }

  // ✅ CRITICAL FIX: Always clean citations and garbage values from inline display
  const cleanDisplayContent = (text) => {
    if (!text) return '';
    let str = text.toString();

    // ✅ FIX: Strip ALL emojis (they look cheap in finance apps)
    // This regex matches most emoji ranges including symbols
    str = str.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{2728}]|[\u{26A0}]|[\u{1F4CA}]|[\u{1F3AF}]|[\u{2B06}]|[\u{2934}]|[\u{2935}]|[\u{FE0F}]/gu, '');

    // Filter out garbage values like 'any', 'n/a', etc.
    const garbageValues = ['any', 'n/a', 'na', 'null', 'undefined', 'none', '-', 'not found in document'];
    if (garbageValues.includes(str.toLowerCase().trim())) {
      return '';
    }

    let cleaned = str.replace(/\|\|CITE:.*?\|\|/g, '');
    // Comment 2: Removed regex for REASONING since backend no longer sends it
    cleaned = cleaned.replace(/\|\|[^|]+\|\|/g, '');
    cleaned = cleaned.replace(/\*\(Source:[^)]+\)\*/gi, '');
    // ✅ Strip markdown bold markers
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    // ✅ NEW: Strip markdown headers (## and ###) from cell preview
    cleaned = cleaned.replace(/^#{1,4}\s*/gm, '');
    cleaned = cleaned.replace(/\[(\d+)\]/g, '');
    cleaned = cleaned.replace(/\|+/g, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    // to preserve accurate values like "Net Debt" and "Total Addressable Market"

    // Final check for garbage after cleaning
    if (garbageValues.includes(cleaned.toLowerCase().trim())) {
      return '';
    }

    return cleaned;
  };



  // Comment 3: Harden structured summary detection
  const parseStructuredSummarySafe = (text) => {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  };

  // Detect structured summary using safe parser
  const isStructuredSummary = (text) => {
    const parsed = parseStructuredSummarySafe(text);
    return parsed && typeof parsed === 'object' && (parsed.title || parsed.content);
  };

  // Pre-calculate raw cleaned for detection (strip citations only)
  const rawCleaned = contentString.replace(/\|\|CITE:.*?\|\|/g, '').replace(/\*\(Source:[^)]+\)\*/gi, '').trim();
  const summaryObj = parseStructuredSummarySafe(rawCleaned);
  const isStructured = summaryObj && typeof summaryObj === 'object' && (summaryObj.title || summaryObj.content);

  // ✅ Helper to strip emojis (used for structured summary titles too)
  const stripEmojis = (text) => {
    if (!text) return '';
    return text.toString().replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{2728}]|[\u{26A0}]|[\u{1F4CA}]|[\u{1F3AF}]|[\u{2B06}]|[\u{2934}]|[\u{2935}]|[\u{FE0F}]/gu, '').trim();
  };

  // ✅ ALWAYS display cleaned content in cells (never show citations inline)
  let displayValue;
  if (isStructured && summaryObj) {
    // ✅ FIX: Strip emojis from structured summary titles too!
    const rawTitle = summaryObj.title || (summaryObj.content ? summaryObj.content.slice(0, 50) + '...' : 'Summary');
    displayValue = stripEmojis(rawTitle);
  } else {
    const cleaned = cleanDisplayContent(contentString);
    // Don't show N/A for "Extracting..." - that's a loading state
    if (cleaned === PLACEHOLDER_VALUE || value.is_placeholder) {
      displayValue = cleaned;
    } else {
      // ✅ CRITICAL FIX: Do NOT auto-show "Extracting..." for empty cells
      // The backend sends explicit "Extracting..." messages only to valid file rows
      // Auto-showing it for ALL empty cells caused rows 5-20 to show Extracting incorrectly
      displayValue = cleaned || null; // null triggers N/A in render
    }

    // ✅ CRITICAL: Final safety check - ensure displayValue is renderable
    if (typeof displayValue === 'object' && displayValue !== null) {
      // console.warn('[TextCell] displayValue is still an object, forcing string conversion:', displayValue);
      displayValue = String(displayValue);
    }
  }
  const BADGE_CONFIG = {
    computed: { color: 'purple', label: 'Computed', explanation: 'Calculated from other fields' },
    web_search: { color: 'blue', label: 'Web', explanation: 'Retrieved from web search' },
    variant: { color: 'green', label: 'Variant', explanation: 'Found via synonym search' },
  };

  const badgeConfig = value.badge ? (typeof value.badge === 'string' ? BADGE_CONFIG[value.badge] : value.badge) : null;

  function onChange(e) {
    if (isEditing) {
      setValue(old => ({ ...old, text: e.target.value, update: false }));
    }
  }

  function onBlur(e) {
    if (isEditing) {
      setValue(old => ({ ...old, update: true }));
    }
    setIsEditing(false);
    setIsSelected(false);
  }

  function handleClick(e) {
    if (isEditing) return;

    // Special handling for Document Name column - open PDF viewer
    if (columnId === 'Document Name') {
      const filename = displayValue || value.text;
      if (filename && openSourceViewer) {
        openSourceViewer({
          filename: filename,
          text: '', // No specific chunk for document badge clicks
          field: 'Document Name'
        }, '');
      }
      return; // Don't open modal
    }

    // Default behavior for other columns
    setShowModal(true);
  }

  function handleDoubleClick(e) {
    e.preventDefault();
    setIsSelected(true);
    setIsEditing(true);
    setTimeout(() => {
      if (cellRef.current) {
        cellRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(cellRef.current);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 0);
  }

  useEffect(() => {
    if (value.update) {
      dataDispatch({
        type: ActionTypes.UPDATE_CELL,
        columnId,
        rowIndex,
        value: { text: value.text, badge: value.badge },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.update, columnId, rowIndex]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
      {/* Wrapper for Gradient Wave Animation */}
      <div
        className={isUpdating ? 'column-updating' : ''}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          paddingLeft: '0'
        }}
      >
        {isEditing ? (
          <ContentEditable
            innerRef={cellRef}
            html={displayValue || ''} // ✅ FIX: Use clean displayValue, not raw value.text with citations
            disabled={false}
            onChange={onChange}
            onBlur={onBlur}
            onDoubleClick={handleDoubleClick}
            onClick={handleClick}
            className="data-cell-content"
            style={{
              cursor: 'pointer',
              color: displayValue ? 'inherit' : '#999'
            }}
          />
        ) : (
          <div
            ref={cellRef} // ✅ FIX: Attach ref for modal positioning
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            className={`data-input ${isSelected ? 'cell-selected' : ''}`}
            style={{
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              pointerEvents: 'auto',
              width: '100%',
              maxWidth: '300px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between' // ✅ FIX: Space between text and dot
            }}
          >
            {/* Blinking Logic */}
            {(displayValue === PLACEHOLDER_VALUE || value.is_placeholder) ? (
              <>
                <span style={{
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  background: 'linear-gradient(to right, #6B7280 0%, #9CA3AF 50%, #6B7280 100%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'shimmer 3s linear infinite'
                }}>
                  Extracting
                  <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.2s', marginLeft: '2px', background: 'inherit', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>.</span>
                  <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.4s', background: 'inherit', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>.</span>
                  <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.6s', background: 'inherit', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>.</span>
                  <style>{`
                      @keyframes blink {
                        0% { opacity: .2; }
                        20% { opacity: 1; }
                        100% { opacity: .2; }
                      }
                      @keyframes pulse-blue {
                        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                        70% { transform: scale(1); box-shadow: 0 0 0 4px rgba(59, 130, 246, 0); }
                        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                      }
                      @keyframes shimmer {
                        to {
                          background-position: 200% center;
                        }
                      }
                    `}</style>
                </span>
                {/* Blue Dot on Right */}
                <div style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#3B82F6',
                  borderRadius: '50%',
                  animation: 'pulse-blue 2s infinite',
                  marginRight: '4px'
                }} />
              </>
            ) : isStructured ? (
              <span style={{
                color: '#111827',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                {/* REMOVED: Unnecessary emoji per user request */}
                {displayValue}
              </span>
            ) : (
              // ✅ FIX: Show blank instead of N/A for empty cells
              <span style={{
                color: displayValue ? '#111827' : '#9CA3AF',
                fontStyle: displayValue ? 'normal' : 'italic'
              }}>
                {displayValue}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Badge Rendering */}
      {badgeConfig && (
        <div style={{ marginLeft: '8px', flexShrink: 0 }}>
          <Badge
            label={badgeConfig?.label}
            color={badgeConfig?.color || 'gray'}
            explanation={badgeConfig?.explanation}
          />
        </div>
      )}

      {showModal && (
        <CellModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          content={contentString}
          columnName={columnId}
          cellRef={cellRef}
          reasoning={value.reasoning} // Pass structured reasoning to modal
          citations={value.citations} // Pass structured citations to modal
          onSave={(newValue) => {
            setValue(old => ({ ...old, text: newValue, update: true }));
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
