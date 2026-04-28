import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Badge({ label, color, explanation }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const badgeRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const colors = {
    red: { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
    green: { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
    yellow: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },  // Added yellow for neutral/hold
    gray: { bg: '#F3F4F6', text: '#1F2937', border: '#E5E7EB' },
  };

  const style = colors[color] || colors.gray;

  const handleMouseEnter = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
      });
      setShowExplanation(true);
    }
  };

  const handleMouseLeave = () => {
    setShowExplanation(false);
  };

  return (
    <>
      <span
        ref={badgeRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          backgroundColor: style.bg,
          color: style.text,
          border: `1px solid ${style.border}`,
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          cursor: 'help',
          display: 'inline-flex',
          alignItems: 'center',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      {showExplanation && explanation && createPortal(
        <div
          style={{
            position: 'absolute',
            top: coords.top,
            left: coords.left,
            backgroundColor: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 9999,
            maxWidth: '250px',
            fontSize: '0.875rem',
            color: '#374151',
            lineHeight: '1.4',
          }}
        >
          <strong>Why?</strong> {explanation}
        </div>,
        document.body
      )}
    </>
  );
}
