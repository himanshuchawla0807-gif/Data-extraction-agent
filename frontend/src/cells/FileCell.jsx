import React from 'react';
import { useSourceViewer } from '../AppContext';

export default function FileCell({ initialValue, rowIndex, columnId }) {
    const { openSourceViewer } = useSourceViewer();

    const displayValue = (initialValue && typeof initialValue === 'object')
        ? (initialValue.value || initialValue.text || '')
        : initialValue;

    if (!displayValue) return null;

    const handleClick = () => {
        openSourceViewer({
            filename: displayValue,
            text: '', // No specific chunk for document badge clicks
            field: 'Document Name'
        }, '');
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 12px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '9999px',
                color: '#334155',
                fontSize: '13px',
                fontWeight: '500',
                width: '100%',
                maxWidth: '100%',
                cursor: 'pointer', // Changed from 'default'
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                boxSizing: 'border-box',
                transition: 'all 0.2s'
            }}
            onClick={handleClick}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e2e8f0';
                e.currentTarget.style.borderColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.borderColor = '#e2e8f0';
            }}
            title={`Click to view ${displayValue}`}
        >
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ marginRight: '6px', flexShrink: 0, color: '#64748b' }}
            >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0
            }}>
                {displayValue}
            </span>
        </div>
    );
}
