import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePopper } from 'react-popper';
import { Constants } from '../utils';
import AddColumnHeader from './AddColumnHeader';
import DataTypeIcon from './DataTypeIcon';
import HeaderMenu from './HeaderMenu';

export default function Header(props) {
  // ✅ FIX: Safe destructuring with explicit defaults
  const column = props.column || {};
  const {
    id,
    created,
    label,
    dataType,
    getResizerProps = () => ({}),
    getHeaderProps = () => ({ key: column.id || Math.random(), style: {}, role: 'columnheader' })
  } = column;

  const { setSortBy, dataDispatch } = props;

  // [DEBUG] Check if adapter failed
  if (typeof getHeaderProps !== 'function') {
    console.error(`[Header] getHeaderProps is NOT a function for column ${id}`, column);
  }
  const [showHeaderMenu, setShowHeaderMenu] = useState(created || false);
  const [isSelected, setIsSelected] = useState(false);
  const [headerMenuAnchorRef, setHeaderMenuAnchorRef] = useState(null);
  const [headerMenuPopperRef, setHeaderMenuPopperRef] = useState(null);

  // ⚠️ CRITICAL: Use ref to persist scroll position across renders
  // Initialize to null so we know when it hasn't been captured yet
  const scrollPositionRef = useRef(null);

  const headerMenuPopper = usePopper(headerMenuAnchorRef, headerMenuPopperRef, {
    placement: 'bottom',
    strategy: 'absolute',
  });

  /* when the column is newly created, set it to open */
  useEffect(() => {
    if (created) {
      setShowHeaderMenu(true);
    }
  }, [created]);

  // ⚠️ CRITICAL FIX: ALWAYS track scroll position, not just when menu is open
  // This ensures the FIRST click has the correct scroll position captured
  useEffect(() => {
    const tableContainer = document.querySelector('.table-container');
    if (!tableContainer) return;

    const saveScrollPosition = () => {
      scrollPositionRef.current = {
        left: tableContainer.scrollLeft,
        top: tableContainer.scrollTop
      };
    };

    // ⚠️ CRITICAL: Capture initial scroll position IMMEDIATELY on mount
    saveScrollPosition();

    // Save position on EVERY scroll event
    tableContainer.addEventListener('scroll', saveScrollPosition, { passive: true });

    return () => {
      tableContainer.removeEventListener('scroll', saveScrollPosition);
    };
  }, []);  // ⚠️ Empty dependency - runs once on mount and always tracks

  // ⚠️ CRITICAL: Utility to restore scroll position after state changes
  const restoreScrollPosition = useCallback(() => {
    const tableContainer = document.querySelector('.table-container');
    if (!tableContainer) return;

    // ⚠️ FIX: Handle case where scroll hasn't been captured yet
    if (!scrollPositionRef.current) {
      // Capture current position as fallback
      scrollPositionRef.current = {
        left: tableContainer.scrollLeft,
        top: tableContainer.scrollTop
      };
      return; // Nothing to restore if we just captured
    }

    const { left, top } = scrollPositionRef.current;

    // Disable smooth scrolling temporarily
    const originalBehavior = tableContainer.style.scrollBehavior;
    tableContainer.style.scrollBehavior = 'auto';

    // Immediate restore
    tableContainer.scrollLeft = left;
    tableContainer.scrollTop = top;

    // Use multiple RAFs and timeouts for maximum reliability
    requestAnimationFrame(() => {
      tableContainer.scrollLeft = left;
      tableContainer.scrollTop = top;
      requestAnimationFrame(() => {
        tableContainer.scrollLeft = left;
        tableContainer.scrollTop = top;
      });
    });

    // Also restore after a delay (for slower render cycles)
    setTimeout(() => {
      tableContainer.scrollLeft = left;
      tableContainer.scrollTop = top;
      tableContainer.style.scrollBehavior = originalBehavior || '';
    }, 50);

    setTimeout(() => {
      tableContainer.scrollLeft = left;
      tableContainer.scrollTop = top;
    }, 100);
  }, []);

  function handleHeaderClick(e) {
    // Prevent default behavior and stop propagation
    e.preventDefault();
    e.stopPropagation();

    // Save current scroll position BEFORE any DOM changes
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      scrollPositionRef.current = {
        left: tableContainer.scrollLeft,
        top: tableContainer.scrollTop
      };
    }

    // Toggle the header menu
    setIsSelected(!showHeaderMenu);
    setShowHeaderMenu(!showHeaderMenu);

    // Restore scroll position after state change
    restoreScrollPosition();
  }

  // ⚠️ CRITICAL: This function MUST preserve scroll when closing menu
  function handleMenuClose(e) {
    // Prevent any default behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Save scroll position before state change
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      scrollPositionRef.current = {
        left: tableContainer.scrollLeft,
        top: tableContainer.scrollTop
      };
    }

    setShowHeaderMenu(false);
    setIsSelected(false);

    // Restore scroll position
    restoreScrollPosition();
  }

  function getHeader() {
    if (id === Constants.ADD_COLUMN_ID) {
      return (
        <AddColumnHeader
          dataDispatch={dataDispatch}
          getHeaderProps={getHeaderProps}
        />
      );
    }

    const headerProps = getHeaderProps();
    const { key: headerKey, ...restHeaderProps } = headerProps;

    return (
      <>
        <div {...restHeaderProps} className={`th noselect d-inline-block ${isSelected ? 'column-selected' : ''}`}>
          <div
            className="th-content"
            onClick={handleHeaderClick}
            ref={setHeaderMenuAnchorRef}
          >
            <span className="svg-icon svg-gray icon-margin">
              <DataTypeIcon dataType={dataType} />
            </span>
            {label}
          </div>
          <div {...getResizerProps()} className="resizer" />
        </div>
        {showHeaderMenu && (
          <div className="overlay" onClick={handleMenuClose} />
        )}
        {showHeaderMenu && (
          <HeaderMenu
            label={label}
            dataType={dataType}
            popper={headerMenuPopper}
            popperRef={setHeaderMenuPopperRef}
            dataDispatch={dataDispatch}
            setSortBy={setSortBy}
            columnId={id}
            setShowHeaderMenu={setShowHeaderMenu}
            onClose={handleMenuClose}  // ⚠️ Pass the scroll-preserving close function
          />
        )}
      </>
    );
  }

  return getHeader();
}

