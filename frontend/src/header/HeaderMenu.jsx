import React, { useEffect, useState } from 'react';
import { grey } from '../colors';
import TypesMenu from './TypesMenu';
import { usePopper } from 'react-popper';
import { ActionTypes } from '../utils';
import DataTypeIcon from './DataTypeIcon';

export default function HeaderMenu({
  label,
  dataType,
  columnId,
  setSortBy,
  popper,
  popperRef,
  dataDispatch,
  setShowHeaderMenu,
  onClose,  // ⚠️ CRITICAL: Use this scroll-preserving close function
}) {
  const [inputRef, setInputRef] = useState(null);
  const [header, setHeader] = useState(label);
  const [typeReferenceElement, setTypeReferenceElement] = useState(null);
  const [typePopperElement, setTypePopperElement] = useState(null);
  const typePopper = usePopper(typeReferenceElement, typePopperElement, {
    placement: 'right-start',
    strategy: 'fixed',
    modifiers: [
      {
        name: 'offset',
        options: {
          offset: [0, 0],
        },
      },
    ],
  });
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [typeMenuTimeout, setTypeMenuTimeout] = useState(null);
  const [prompt, setPrompt] = useState('You are an expert real estate analyst. Extract the full property name from the Offering Memorandum. This should be the official name of the property as listed in the document. Return only the property name without any additional commentary.');
  const [columnQuery, setColumnQuery] = useState('');  // NEW: Column-specific query state

  function onTypeMenuClose() {
    setShowTypeMenu(false);
    // Use scroll-preserving close if available, fallback to direct call
    if (onClose) {
      onClose();
    } else {
      setShowHeaderMenu(false);
    }
  }

  function handleTypeMenuEnter() {
    if (typeMenuTimeout) {
      clearTimeout(typeMenuTimeout);
      setTypeMenuTimeout(null);
    }
    setShowTypeMenu(true);
  }

  function handleTypeMenuLeave() {
    const timeout = setTimeout(() => {
      setShowTypeMenu(false);
    }, 500); // 0.5 second delay
    setTypeMenuTimeout(timeout);
  }

  useEffect(() => {
    setHeader(label);
  }, [label]);

  useEffect(() => {
    if (inputRef) {
      // ⚠️ CRITICAL FIX: preventScroll prevents browser from scrolling when focusing
      // This was the ROOT CAUSE of the horizontal scroll reset issue!
      inputRef.focus({ preventScroll: true });
      inputRef.select();
    }
  }, [inputRef]);

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (typeMenuTimeout) {
        clearTimeout(typeMenuTimeout);
      }
    };
  }, [typeMenuTimeout]);

  function handleColumnNameChange(e) {
    setHeader(e.target.value);
  }

  function handleColumnNameBlur(e) {
    e.preventDefault();
    dataDispatch({
      type: ActionTypes.UPDATE_COLUMN_HEADER,
      columnId,
      label: header,
    });
  }

  function handlePromptChange(e) {
    setPrompt(e.target.value);
  }

  // NEW: Handle column query submission
  async function handleColumnQuerySubmit() {
    if (!columnQuery.trim()) return;

    console.log('[COLUMN_QUERY] Submitting:', columnQuery, 'for column:', columnId);

    // Send to backend via WebSocket
    // Dispatch event to App.jsx to handle as a sidebar chat query
    // This ensures it appears in the chat history and uses the main agent flow
    console.log('[COLUMN_QUERY] Dispatching event to App.jsx');

    const event = new CustomEvent('triggerRefineQuery', {
      detail: {
        query: columnQuery,
        columnId: columnId,
        columnName: header
      }
    });
    window.dispatchEvent(event);

    // Clear query and close menu using scroll-preserving function
    setColumnQuery('');
    if (onClose) {
      onClose();
    } else {
      setShowHeaderMenu(false);
    }
  }

  return (
    <div
      ref={popperRef}
      style={{ ...popper.styles.popper, zIndex: 1001 }}
      {...popper.attributes.popper}
    >
      <div className="header-menu-minimalist">
        {/* Property Name */}
        <div className="menu-section">
          <label className="menu-label">Property Name</label>
          <div className="menu-input-group">
            <input
              type="text"
              value={header}
              onChange={handleColumnNameChange}
              onBlur={handleColumnNameBlur}
              className="menu-input"
              ref={setInputRef}
            />
            <button
              className="menu-icon-btn"
              title="Refresh - Re-extract this column"
              onClick={() => {
                const event = new CustomEvent('triggerRefineQuery', {
                  detail: {
                    query: `Re-extract the ${header} value from the documents`,
                    columnId: columnId,
                    columnName: header
                  }
                });
                window.dispatchEvent(event);
                onClose ? onClose() : setShowHeaderMenu(false);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Type */}
        <div className="menu-section">
          <label className="menu-label">Type</label>
          <div
            className="menu-select type-select-wrapper"
            ref={setTypeReferenceElement}
            onMouseEnter={handleTypeMenuEnter}
            onMouseLeave={handleTypeMenuLeave}
          >
            <div className="menu-select-content">
              <span className="menu-select-icon">
                <DataTypeIcon dataType={dataType || 'text'} />
              </span>
              <span className="menu-select-text">{(dataType && typeof dataType === 'string') ? (dataType.charAt(0).toUpperCase() + dataType.slice(1)) : 'Text'}</span>
            </div>
            <span className="menu-select-arrow">›</span>
          </div>
          {showTypeMenu && (
            <TypesMenu
              popper={typePopper}
              popperRef={setTypePopperElement}
              dataDispatch={dataDispatch}
              setShowTypeMenu={setShowTypeMenu}
              onClose={onTypeMenuClose}
              columnId={columnId}
              onMouseEnter={handleTypeMenuEnter}
              onMouseLeave={handleTypeMenuLeave}
            />
          )}
        </div>

        {/* Column Query Section with Enter Button */}
        <div className="menu-section">
          <label className="menu-label">Refine this Column</label>
          <textarea
            className="menu-textarea"
            value={columnQuery}
            onChange={(e) => setColumnQuery(e.target.value)}
            placeholder="e.g., 'Extract this as percentage' or 'Remove this column' or 'Change to net income'"
            rows={4}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleColumnQuerySubmit();
              }
            }}
          />
          <button
            className="prompt-submit-btn"
            onClick={handleColumnQuerySubmit}
            disabled={!columnQuery.trim()}
            title="Submit query (Ctrl+Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <span>Submit</span>
          </button>
        </div>

        {/* Divider */}
        <div className="menu-divider" />

        {/* Menu Items */}
        <button
          className="menu-item"
          onClick={() => {
            dataDispatch({
              type: ActionTypes.UPDATE_COLUMN_HEADER,
              columnId,
              label: header,
            });
            setSortBy([{ id: columnId, desc: false }]);
            onClose ? onClose() : setShowHeaderMenu(false);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="menu-item-icon">
            <path d="M7 11V3M4 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Sort ascending</span>
        </button>

        <button
          className="menu-item"
          onClick={() => {
            dataDispatch({
              type: ActionTypes.UPDATE_COLUMN_HEADER,
              columnId,
              label: header,
            });
            setSortBy([{ id: columnId, desc: true }]);
            onClose ? onClose() : setShowHeaderMenu(false);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="menu-item-icon">
            <path d="M7 3v8M4 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Sort descending</span>
        </button>

        <button
          className="menu-item"
          onClick={() => {
            // ✅ Hide column (recoverable - use HIDE_COLUMN instead of DELETE)
            dataDispatch({ type: ActionTypes.HIDE_COLUMN, columnId });
            onClose ? onClose() : setShowHeaderMenu(false);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="menu-item-icon">
            <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span>Hide from view</span>
        </button>

        <div className="menu-divider" />


        <button
          className="menu-item menu-item-danger"
          onClick={() => {
            dataDispatch({ type: ActionTypes.DELETE_COLUMN, columnId });
            onClose ? onClose() : setShowHeaderMenu(false);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="menu-item-icon">
            <path d="M1 3.5h12M5.5 1h3M5.5 6v4.5M8.5 6v4.5M2.5 3.5h9v8.5a1 1 0 01-1 1h-7a1 1 0 01-1-1v-8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Delete Property</span>
        </button>
      </div>
    </div>
  );
}
