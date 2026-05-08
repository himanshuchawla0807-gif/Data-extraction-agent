import React, { useEffect, useState, useRef } from 'react';
import ContentEditable from 'react-contenteditable';
import { ActionTypes } from '../utils';
import CellModal from '../components/CellModal';
import Badge from '../Badge'; // Assuming Badge component exists

export default function NumberCell({
  initialValue,
  columnId,
  rowIndex,
  dataDispatch,
  isUpdating, // ✅ Receive isUpdating
}) {
  // Handle both string and object values
  const parseValue = (val) => {
    // Handle structured cell objects with { value, citations, ... } format from restore
    if (val && typeof val === 'object' && val.value !== undefined) {
      return {
        text: String(val.value || ''),  // ✅ FIX: Extract the value property
        citations: val.citations || [],
        reasoning: val.reasoning || null,
        badge: val.badge || null
      };
    }
    // Handle legacy format with text property
    if (val && typeof val === 'object' && val.text !== undefined) {
      return {
        ...val,
        text: String(val.text || '')  // Ensure text is a string
      };
    }
    // Handle primitive values (strings, numbers)
    return { text: val != null ? String(val) : '', badge: null };
  };


  const [value, setValue] = useState({ ...parseValue(initialValue), update: false });
  const [isSelected, setIsSelected] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const cellRef = useRef(null);

  // Sync with initialValue prop changes
  useEffect(() => {
    // console.log('[NUMBERCELL_SYNC] Syncing value with initialValue:', initialValue);
    setValue({ ...parseValue(initialValue), update: false });
  }, [initialValue]);

  function onChange(e) {
    if (isEditing) {
      // Only update text part when editing
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

  const cleanDisplayContent = (text) => {
    if (!text) return '';
    const str = text.toString();

    // Filter out garbage values like 'any', 'n/a', etc.
    const garbageValues = ['any', 'n/a', 'na', 'null', 'undefined', 'none', '-'];
    if (garbageValues.includes(str.toLowerCase().trim())) {
      return '';
    }

    // Remove citations and markdown
    let cleaned = str.replace(/\|\|CITE:.*?\|\|/g, '');
    cleaned = cleaned.replace(/\|\|[^|]+\|\|/g, '');
    cleaned = cleaned.replace(/\*\(Source:[^)]+\)\*/gi, '');
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/\[\d+\]/g, '');
    cleaned = cleaned.replace(/\|+/g, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    // Final check for garbage after cleaning
    if (garbageValues.includes(cleaned.toLowerCase().trim())) {
      return '';
    }

    return cleaned;
  };

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



  // Premium Formatting Logic
  const formatDisplayValue = (rawText) => {
    const cleaned = cleanDisplayContent(rawText);
    if (!cleaned) return '';

    // Check for Currency
    if (cleaned.startsWith('$')) {
      return (
        <>
          <span style={{ color: '#111827', fontWeight: 500, marginRight: '1px' }}>$</span>
          {cleaned.substring(1)}
        </>
      );
    }
    // Check for Percentage
    if (cleaned.endsWith('%')) {
      return (
        <>
          {cleaned.slice(0, -1)}
          <span style={{ color: '#111827', fontWeight: 500, marginLeft: '1px' }}>%</span>
        </>
      );
    }
    return cleaned;
  };

  const contentString = (value.text && value.text.toString()) || '';

  // ✅ ALWAYS display cleaned value (no citations)
  const displayValue = cleanDisplayContent(value.text);

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
      {/* Editable Content */}
      <div
        className={`data-input ${isSelected ? 'cell-selected' : ''} ${isUpdating ? 'column-updating' : ''}`}
        style={{
          flex: 1,
          cursor: isEditing ? 'text' : 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: isEditing ? 'normal' : 'nowrap',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between', // ✅ FIX: Space between text and dot
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          color: '#111827'
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        ref={cellRef} // ✅ FIX: Attach ref for modal positioning
      >
        {isEditing ? (
          <ContentEditable
            innerRef={cellRef}
            html={cleanDisplayContent(value.text)} // Plain text when editing
            onChange={onChange}
            onBlur={onBlur}
            style={{ outline: 'none', width: '100%' }}
          />
        ) : (
          /* Blinking Logic */
          displayValue === 'Extracting...' ? (
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
          ) : (
            <span>{formatDisplayValue(value.text)}</span>
          )
        )}
      </div>


      {/* Badge Rendering */}
      {
        value.badge && (
          <div style={{ marginLeft: '8px', flexShrink: 0 }}>
            <Badge
              label={value.badge.label}
              color={value.badge.label === 'Risk' ? 'red' : value.badge.label === 'Opportunity' ? 'green' : 'gray'}
              explanation={value.badge.explanation}
            />
          </div>
        )
      }

      {
        showModal && (
          <CellModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            content={contentString}
            columnName={columnId}
            cellRef={cellRef}
            onSave={(newValue) => {
              setValue(old => ({ ...old, text: newValue, update: true }));
              setShowModal(false);
            }}
          />
        )
      }
    </div >
  );
}
