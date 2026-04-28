import React, { useEffect, useRef } from 'react';

export default function ColumnHeaderMenu({ 
  column, 
  position, 
  onClose, 
  onSortAscending,
  onSortDescending,
  onPin,
  onHide,
  onCopyId,
  onDelete
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const menuItems = [
    { icon: '↑', label: 'Sort ascending', onClick: onSortAscending },
    { icon: '↓', label: 'Sort descending', onClick: onSortDescending },
    { type: 'divider' },
    { icon: '📌', label: 'Pin', onClick: onPin },
    { icon: '👁', label: 'Hide from view', onClick: onHide },
    { type: 'divider' },
    { icon: '📋', label: 'Copy column ID', onClick: onCopyId },
    { icon: '🗑', label: 'Delete column', onClick: onDelete, danger: true },
  ];

  return (
    <>
      <div className="column-menu-overlay" onClick={onClose} />
      <div
        ref={menuRef}
        className="column-header-menu shadow-5"
        style={{
          position: 'fixed',
          top: position.y,
          left: position.x,
          zIndex: 1001,
        }}
      >
        <div className="column-menu-header">
          <div className="column-menu-title">{column.label}</div>
          <div className="column-menu-type">Type</div>
        </div>
        
        {menuItems.map((item, index) =>
          item.type === 'divider' ? (
            <div key={index} className="column-menu-divider" />
          ) : (
            <button
              key={index}
              type="button"
              className={`column-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              <span className="menu-item-icon">{item.icon}</span>
              <span className="menu-item-label">{item.label}</span>
            </button>
          )
        )}
      </div>
    </>
  );
}

