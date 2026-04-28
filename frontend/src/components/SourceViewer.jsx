import React from 'react';
import ReactDOM from 'react-dom';
import './SourceViewer.css';

const SourceViewer = ({ isOpen, onClose, source, highlightValue }) => {
    if (!isOpen || !source) return null;

    // Function to highlight the value in the text
    const renderHighlightedText = (text, value) => {
        if (!text) return null;
        if (!value) return text;

        // Escape special regex characters in value
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escapedValue})`, 'gi'));

        return parts.map((part, i) =>
            part.toLowerCase() === value.toLowerCase() ? (
                <mark key={i} className="source-highlight">{part}</mark>
            ) : (
                part
            )
        );
    };

    return ReactDOM.createPortal(
        <div className="source-viewer-backdrop" onClick={onClose}>
            <div className="source-viewer-modal" onClick={e => e.stopPropagation()}>
                <div className="source-viewer-header">
                    <div className="source-viewer-title">
                        <svg className="source-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <div className="source-info">
                            <h3>{source.filename || 'Unknown File'}</h3>
                            <span className="source-meta">
                                {source.field ? `Field: ${source.field}` : 'Source Document'}
                            </span>
                        </div>
                    </div>
                    <button className="source-viewer-close" onClick={onClose}>×</button>
                </div>

                <div className="source-viewer-body">
                    <div className="source-content">
                        {renderHighlightedText(source.text, highlightValue)}
                    </div>
                </div>

                <div className="source-viewer-footer">
                    <div className="source-viewer-actions">
                        <button className="source-btn secondary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SourceViewer;
