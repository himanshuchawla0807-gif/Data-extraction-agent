import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import {
  useTable,
  useBlockLayout,
  useResizeColumns,
  useSortBy,
} from 'react-table';
import Cell from './cells/Cell';
import Header from './header/Header';
import PlusIcon from './img/Plus';
import { ActionTypes, Constants } from './utils';
import RowSelector from './RowSelector';
import RowSelectorHeader from './RowSelectorHeader';
import RowContextMenu from './RowContextMenu';

const defaultColumn = {
  minWidth: 80,
  width: 150,
  maxWidth: 400,
  Cell: Cell,
  Header: Header,
  sortType: 'alphanumericFalsyLast',
};

export default function Table({
  columns,
  data,
  dispatch: dataDispatch,
  skipReset,
  updatingColumns, // ✅ Receive updatingColumns
}) {
  const sortTypes = useMemo(
    () => ({
      alphanumericFalsyLast(rowA, rowB, columnId, desc) {
        if (!rowA.values[columnId] && !rowB.values[columnId]) {
          return 0;
        }

        if (!rowA.values[columnId]) {
          return desc ? -1 : 1;
        }

        if (!rowB.values[columnId]) {
          return desc ? 1 : -1;
        }

        return isNaN(rowA.values[columnId])
          ? rowA.values[columnId].localeCompare(rowB.values[columnId])
          : rowA.values[columnId] - rowB.values[columnId];
      },
    }),
    []
  );

  // Load saved column widths from localStorage
  const [initialColumnWidths, setInitialColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem('tableColumnWidths');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Apply saved widths to columns and filter out hidden columns
  const columnsWithWidths = useMemo(() => {
    return columns
      .filter(col => !col.hidden) // ✅ Filter out hidden columns
      .map(col => ({
        ...col,
        width: initialColumnWidths[col.id] || col.width || 150,
      }));
  }, [columns, initialColumnWidths]);

  // ✅ Track hidden columns for "Show Hidden Columns" UI
  const hiddenColumns = useMemo(() => {
    return columns.filter(col => col.hidden);
  }, [columns]);

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    totalColumnsWidth,
    setSortBy,  // ✅ Add setSortBy for sorting functionality
  } = useTable(
    {
      columns: columnsWithWidths,
      data,
      defaultColumn,
      dataDispatch,
      autoResetSortBy: !skipReset,
      autoResetFilters: !skipReset,
      autoResetRowState: !skipReset,
      sortTypes,
    },
    useBlockLayout,
    useResizeColumns,
    useSortBy
  );

  // ✅ Create stable reference for components to access setSortBy
  const sortByRef = useRef(setSortBy);
  useEffect(() => {
    sortByRef.current = setSortBy;
  }, [setSortBy]);

  // Save column widths to localStorage whenever they change
  useEffect(() => {
    if (headerGroups && headerGroups[0]) {
      const widths = {};
      headerGroups[0].headers.forEach(header => {
        if (header.id && header.width) {
          widths[header.id] = header.width;
        }
      });
      try {
        localStorage.setItem('tableColumnWidths', JSON.stringify(widths));
      } catch (e) {
        console.error('Failed to save column widths:', e);
      }
    }
  }, [headerGroups]);

  // Row selection state
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);

  // Clipboard state
  const [clipboard, setClipboard] = useState({ rows: [], mode: null });

  // ✅ Ctrl+C keyboard handler for copy with pipes
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+C or Cmd+C when rows are selected
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedRows.size > 0) {
        e.preventDefault(); // Prevent default browser copy

        const rowsToCopy = Array.from(selectedRows).sort((a, b) => a - b).map(i => rows[i]?.original).filter(Boolean);

        if (rowsToCopy.length > 0 && columnsWithWidths.length > 0) {
          // Use visible columns (excluding Add Column button)
          const visibleCols = columnsWithWidths.filter(col => col.id !== Constants.ADD_COLUMN_ID);

          // Build header row
          const headerRow = visibleCols.map(col => col.label || col.accessor || col.id).join(' | ');

          // Build data rows
          const dataRows = rowsToCopy.map(row =>
            visibleCols.map(col => {
              const val = row[col.accessor || col.id];
              if (val && typeof val === 'object') {
                return String(val.value || val.text || '');
              }
              return String(val || '');
            }).join(' | ')
          ).join('\n');

          const formattedText = headerRow + '\n' + dataRows;

          navigator.clipboard.writeText(formattedText).then(() => {
            console.log('✅ Ctrl+C: Copied to clipboard with pipes');
          }).catch(err => {
            console.warn('Copy failed:', err);
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedRows, rows, columnsWithWidths]);

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
    const rowsToCopy = Array.from(selectedRows).sort((a, b) => a - b).map(i => rows[i]?.original).filter(Boolean);
    setClipboard({ rows: rowsToCopy, mode: 'copy' });

    // ✅ Copy to system clipboard with pipe separators using visible columns
    if (rowsToCopy.length > 0 && columnsWithWidths.length > 0) {
      // Use visible columns (excluding Add Column button)
      const visibleCols = columnsWithWidths.filter(col => col.id !== Constants.ADD_COLUMN_ID);

      // Build header row
      const headerRow = visibleCols.map(col => col.label || col.accessor || col.id).join(' | ');

      // Build data rows
      const dataRows = rowsToCopy.map(row =>
        visibleCols.map(col => {
          const val = row[col.accessor || col.id];
          // Handle structured values (extract .value or .text)
          if (val && typeof val === 'object') {
            return String(val.value || val.text || '');
          }
          return String(val || '');
        }).join(' | ')
      ).join('\n');

      const formattedText = headerRow + '\n' + dataRows;

      navigator.clipboard.writeText(formattedText).then(() => {
        console.log('✅ Copied to clipboard with pipe separators:', formattedText);
      }).catch(err => {
        console.warn('Copy failed:', err);
      });
    }
  }, [selectedRows, rows, columnsWithWidths]);

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
    for (let headerGroup of headerGroups) {
      for (let column of headerGroup.headers) {
        if (column.isResizing) {
          return true;
        }
      }
    }

    return false;
  }

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
      {(() => {
        const { key, ...tableProps } = getTableProps();
        return (
          <div
            key={key}
            {...tableProps}
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
                {(() => {
                  const { key, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
                  return (
                    <div key={key} {...headerGroupProps} className="tr" style={{ display: 'flex', flex: 1 }}>
                      {headerGroup.headers.map(column => (
                        <React.Fragment key={column.id}>
                          {column.render('Header', { setSortBy })}
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}

            {/* ✅ Hidden Columns Indicator - Positioned in header area */}
            {hiddenColumns.length > 0 && (
              <div style={{
                padding: '6px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                position: 'fixed',
                top: '12px',
                right: '135px',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                animation: 'fadeSlideIn 0.3s ease-out forwards',
              }}>
                <style>{`
                  @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateX(-20px); }
                    to { opacity: 1; transform: translateX(0); }
                  }
                `}</style>
                <span style={{ color: '#6B7280', fontWeight: 500, fontSize: '12px' }}>
                  Hidden ({hiddenColumns.length}):
                </span>
                {hiddenColumns.map(col => (
                  <button
                    key={col.id}
                    onClick={() => dataDispatch({ type: ActionTypes.SHOW_COLUMN, columnId: col.id })}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                    }}
                    title={`Click to show "${col.label}"`}
                  >
                    {col.label}
                    <span style={{ color: '#10B981', fontWeight: 600, fontSize: '14px' }}>+</span>
                  </button>
                ))}
              </div>
            )}

            {/* Body Rows */}
            <div {...getTableBodyProps()} style={{ minWidth: 'fit-content' }}>
              {rows.map((row, index) => {
                prepareRow(row);
                const isSelected = selectedRows.has(index);
                const { key, ...rowProps } = row.getRowProps();
                return (
                  <div
                    key={key}
                    {...rowProps}
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
                    {row.cells.map(cell => {
                      if (cell.column.id === Constants.ADD_COLUMN_ID) {
                        const { key, ...cellProps } = cell.getCellProps();
                        return (
                          <div key={key} {...cellProps} className="td add-column-cell">
                            {/* Empty cell below the add column button */}
                          </div>
                        );
                      }
                      const { key, ...cellProps } = cell.getCellProps();
                      // ✅ Check if this column is updating
                      const isUpdating = updatingColumns && updatingColumns.has(cell.column.id);

                      return (
                        <div key={key} {...cellProps} className="td">
                          {cell.render('Cell', { isUpdating })}
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
        );
      })()}
    </div>
  );
}