import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ExternalLink, X, FileText } from 'lucide-react';

const CitationPopover = ({ citation, isOpen, onClose }) => {
    const [copied, setCopied] = useState(false);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    const handleCopy = () => {
        const textToCopy = citation.fullContext || citation.excerpt;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen || !citation) return null;

    // structured rendering or standard?
    // The plan says "Structured data rendering: Detect key:value patterns, render as table rows"
    // But also "Content: Full citation chunk with snippet highlighting"

    // ✅ SIMPLIFIED: No highlighting - just render text as-is
    const renderContent = () => {
        const fullContext = citation.fullContext || citation.excerpt || '';

        // Check for structured data (multiple key:value lines)
        const lines = fullContext.split('\n').map(l => l.trim()).filter(l => l);
        const isStructured = lines.length > 1 && lines.filter(l => l.includes(':')).length > lines.length / 2;

        if (isStructured) {
            return (
                <div className="citation-structured-view" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {lines.map((line, i) => {
                        const splitIdx = line.indexOf(':');
                        if (splitIdx === -1) return <div key={i} className="citation-struct-heading" style={{ fontWeight: 600, marginTop: '8px' }}>{line}</div>;

                        const key = line.slice(0, splitIdx).trim();
                        const val = line.slice(splitIdx + 1).trim();

                        return (
                            <div key={i} className="citation-struct-row" style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                                <span className="citation-struct-key" style={{ fontWeight: 600, color: '#4b5563', minWidth: '120px' }}>{key}:</span>
                                <span className="citation-struct-val" style={{ color: '#111827' }}>{val}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Plain text rendering - no highlighting
        return <div className="citation-full-context">{fullContext}</div>;
    };

    return ReactDOM.createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="citation-popover-backdrop" onClick={handleBackdropClick}>
                    <motion.div
                        className="citation-popover-modal"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="citation-popover-modal-header">
                            <div className="citation-popover-modal-title">
                                <div className="source-icon-wrapper">
                                    {citation.source === 'web' ? <ExternalLink size={20} /> : <FileText size={20} />}
                                </div>
                                <div>
                                    <h2>{citation.filename || citation.domain || 'Document'}</h2>
                                    {citation.page && (
                                        <div className="citation-popover-modal-subtitle">
                                            <span className="citation-page-badge">Page {citation.page}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button className="citation-close-btn" onClick={onClose}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="citation-popover-modal-body">
                            {/* ✅ Light blue info note */}
                            <div style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                </svg>
                                <span style={{ color: '#1e40af', fontSize: '13px', fontWeight: 500 }}>
                                    This content was extracted directly from the original document
                                </span>
                            </div>
                            {renderContent()}
                        </div>

                        <div className="citation-popover-modal-footer">
                            <button className="citation-copy-btn" onClick={handleCopy}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copied' : 'Copy Full Chunk'}
                            </button>
                            {citation.source === 'web' && citation.url && (
                                <a
                                    href={citation.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="citation-open-doc-btn"
                                >
                                    <ExternalLink size={16} />
                                    Open Web Source
                                </a>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default CitationPopover;
