/*
 * TanStack Table v8 migration, keeping existing UI/UX;
 * do not remove V7 version until V8 is battle-tested in production.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import Cell from './cells/Cell';
import Header from './header/Header';
import PlusIcon from './img/Plus';
import { ActionTypes, Constants } from './utils';
import RowSelector from './RowSelector';
import RowSelectorHeader from './RowSelectorHeader';
import RowContextMenu from './RowContextMenu';

// Default column definition adapting for V8
const defaultColumnDef = {
  minSize: 80,
  size: 150,
  maxSize: 400,
  cell: Cell, // V8 uses 'cell', not 'Cell'
  header: Header, // V8 uses 'header', not 'Header'
  enableSorting: true,
  // Custom sort function logic can be moved to `sortingFn` prop on column
};

export default function Table({
  columns,
  data,
  dispatch: dataDispatch,
  skipReset,
  updatingColumns,
}) {

  // Load saved column widths from localStorage
  const [initialColumnWidths, setInitialColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem('tableColumnWidths');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Map V7 columns to V8 columns
  const tableColumns = useMemo(() => {
    return columns.map(col => ({
      ...col,
      accessorKey: String(col.accessor || col.id), // ✅ FIX: Ensure string key to prevent .includes() crash
      header: Header, // Explicitly set header component
      cell: Cell, // Explicitly set cell component
      size: initialColumnWidths[col.id] || col.width || 150,
      minSize: col.minWidth || 80,
      maxSize: col.maxWidth || 400,
      meta: {
        dataType: col.dataType, // Pass metadata if needed
        options: col.options
      },
      enableResizing: true, // Enable resizing
      enableSorting: true,
      sortingFn: 'alphanumeric', // Default sort
    }));
  }, [columns, initialColumnWidths]);

  // V8 Table Instance
  const table = useReactTable({
    data,
    columns: tableColumns,
    defaultColumn: defaultColumnDef,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange', // Real-time resizing
    meta: {
      updateData: (rowIndex, columnId, value) => {
        dataDispatch({
          type: ActionTypes.UPDATE_CELL,
          rowIndex,
          columnId,
          value,
        });
      },
      dataDispatch, // Pass dispatch to cells if needed
    },
  });

  // Access V8 APIs
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const flatHeaders = table.getFlatHeaders();

  // Save column widths to localStorage whenever they change
  useEffect(() => {
    const widths = {};
    flatHeaders.forEach(header => {
      widths[header.id] = header.getSize();
    });
    // Only save if we have meaningful widths (avoid empty saves)
    if (Object.keys(widths).length > 0) {
      try {
        localStorage.setItem('tableColumnWidths', JSON.stringify(widths));
      } catch (e) {
        console.error('Failed to save column widths:', e);
      }
    }
  }, [flatHeaders]); // trigger on hierarchy/size changes

  // Row selection state
  const [selectedRows, setSelectedRows] = useState(new Set());
  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);
  // Clipboard state
  const [clipboard, setClipboard] = useState({ rows: [], mode: null });

  const handleToggleRow = useCallback((rowIndex) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowIndex)) {
        newSet.delete(rowIndex);
      } else {
        newSet.add(rowIndex);
      }
      return newSet;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (selectedRows.size === rows.length && rows.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((_, i) => i)));
    }
  }, [selectedRows.size, rows.length]);

  const handleContextMenu = useCallback((e, rowIndex) => {
    e.preventDefault();
    setSelectedRows(new Set([rowIndex]));
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      rowIndex,
    });
  }, []);

  const handleCopy = useCallback(() => {
    const rowsToCopy = Array.from(selectedRows).sort((a, b) => a - b).map(i => rows[i].original);
    setClipboard({ rows: rowsToCopy, mode: 'copy' });
  }, [selectedRows, rows]);

  const handleCut = useCallback(() => {
    const rowsToCut = Array.from(selectedRows).sort((a, b) => a - b).map(i => rows[i].original);
    setClipboard({ rows: rowsToCut, mode: 'cut' });
  }, [selectedRows, rows]);

  const handlePaste = useCallback(() => {
    if (clipboard.rows.length > 0) {
      clipboard.rows.forEach(row => {
        dataDispatch({ type: ActionTypes.ADD_ROW });
        const newRowIndex = data.length;
        Object.keys(row).forEach(key => {
          dataDispatch({
            type: ActionTypes.UPDATE_CELL,
            rowIndex: newRowIndex,
            columnId: key,
            value: row[key],
          });
        });
      });

      if (clipboard.mode === 'cut') {
        const indicesToDelete = Array.from(selectedRows).sort((a, b) => b - a);
        dataDispatch({
          type: ActionTypes.DELETE_ROWS,
          rowIndexes: indicesToDelete
        });
        setSelectedRows(new Set());
      }
      setClipboard({ rows: [], mode: null });
    }
  }, [clipboard, selectedRows, data.length, dataDispatch]);

  const handleDeleteRow = useCallback(() => {
    const indicesToDelete = Array.from(selectedRows).sort((a, b) => b - a);
    dataDispatch({ type: ActionTypes.DELETE_ROWS, rowIndexes: indicesToDelete });
    setSelectedRows(new Set());
  }, [selectedRows, dataDispatch]);

  const handleInsertRow = useCallback(() => {
    dataDispatch({ type: ActionTypes.ADD_ROW });
  }, [dataDispatch]);

  function isTableResizing() {
    return table.getState().columnSizingInfo.isResizingColumn;
  }

  // --- Render ---

  // Replicating styles from v7 useBlockLayout
  // We need to manually set width/flex styles on cells/headers

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'auto' }}>
      {contextMenu && (
        <RowContextMenu
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onCut={handleCut}
          onInsertRow={handleInsertRow}
          onDeleteRow={handleDeleteRow}
        />
      )}

      <div
        className={clsx('table', isTableResizing() && 'noselect')}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 'fit-content' }}
      >
        {/* Header Row - Sticky */}
        {headerGroups.map(headerGroup => (
          <div key={headerGroup.id} style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#fff', minWidth: 'fit-content' }}>
            <div className="row-selector-header-cell" style={{ position: 'sticky', left: 0, zIndex: 11, backgroundColor: '#f8f9fa' }}>
              <RowSelectorHeader
                allSelected={selectedRows.size === rows.length && rows.length > 0}
                onToggleAll={handleToggleAll}
              />
            </div>
            <div className="tr" style={{ display: 'flex', flex: 1 }}>
              {headerGroup.headers.map(header => {
                return (
                  <React.Fragment key={header.id}>
                    {/* Pass props compatible with existing Header component */}
                    {flexRender(header.column.columnDef.header, {
                      ...header.getContext(),
                      // Adapter to match v7 header props if needed by Header.jsx
                      column: {
                        ...header.column,
                        id: header.column.id,
                        isResizing: header.column.getIsResizing(),
                        getHeaderProps: () => ({
                          key: header.id,
                          className: 'th', // Replicate 'th' class used by V7 Header? No, Header component handles its own layout usually, but V7 wrapped it.
                          style: {
                            width: header.getSize(),
                            display: 'flex',
                            boxSizing: 'border-box',
                          },
                          role: 'columnheader',
                        }),
                        getResizerProps: () => ({
                          onMouseDown: header.getResizeHandler(),
                          onTouchStart: header.getResizeHandler(),
                          style: {
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none'
                          }
                        }),
                        // Pass dataDispatch to header if needed (legacy location inside column)
                        dataDispatch,
                      },
                      // Fix: Pass dataDispatch as top-level prop as expected by Header.jsx
                      dataDispatch,
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ))}

        {/* Body Rows */}
        <div style={{ minWidth: 'fit-content' }}>
          {rows.map((row, index) => {
            const isSelected = selectedRows.has(index);
            return (
              <div
                key={row.id}
                className={clsx('tr', { 'row-selected': isSelected })}
                onContextMenu={(e) => handleContextMenu(e, index)}
                style={{ display: 'flex', minWidth: 'fit-content' }}
              >
                <div className="row-selector-cell" style={{ position: 'sticky', left: 0, zIndex: 9, backgroundColor: isSelected ? '#e8f0fe' : '#f8f9fa' }}>
                  <RowSelector
                    rowIndex={index}
                    isSelected={isSelected}
                    onToggleRow={handleToggleRow}
                  />
                </div>
                {row.getVisibleCells().map(cell => {
                  if (cell.column.id === Constants.ADD_COLUMN_ID) {
                    return (
                      <div key={cell.id} className="td add-column-cell" style={{ width: cell.column.getSize() }}>
                        {/* Empty cell below the add column button */}
                      </div>
                    );
                  }

                  // Check if this column is updating
                  const isUpdating = updatingColumns && updatingColumns.has(cell.column.id);

                  return (
                    <div
                      key={cell.id}
                      className="td"
                      style={{
                        width: cell.column.getSize(),
                        display: 'flex',
                        boxSizing: 'border-box'
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, {
                        ...cell.getContext(),
                        // Adapter for V7 Cell props
                        isUpdating,
                        value: cell.getValue(),
                        row: {
                          ...row,
                          index: row.index
                        },
                        column: {
                          ...cell.column,
                          id: cell.column.id
                        },
                        dataDispatch // Pass dispatch
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Add Row Button */}
        <div
          className="tr add-row"
          onClick={() => dataDispatch({ type: ActionTypes.ADD_ROW })}
          style={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content', position: 'sticky', bottom: 0, backgroundColor: '#fff' }}
        >
          <div style={{ width: '48px', minWidth: '48px', borderRight: '1px solid #e0e0e0', height: '33px', position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 9 }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px', flex: 1 }}>
            <span className="svg-icon svg-gray">
              <PlusIcon />
            </span>
            New
          </div>
        </div>

      </div>
    </div>
  );
}