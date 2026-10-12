import React from 'react';

export default function RowSelectorHeader({ allSelected, onToggleAll }) {
  return (
    <div
      className="row-selector-header"
      onClick={(e) => {
        e.stopPropagation();
        onToggleAll();
      }}
    >
      <div className="select-all-checkbox">
        {allSelected && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
