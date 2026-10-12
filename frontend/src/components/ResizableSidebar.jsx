import React, { useState, useRef, useEffect } from 'react';

export const ResizableSidebar = ({ children, initialWidth = 480, minWidth = 320, maxWidth = 800 }) => {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const newWidth = e.clientX;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minWidth, maxWidth]);

  const handleMouseDown = (e) => {
    setIsResizing(true);
    e.preventDefault();
  };

  return (
    <div
      ref={sidebarRef}
      style={{
        width: `${width}px`,
        position: 'relative',
        height: '100vh',
        borderRight: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: isResizing ? 'none' : 'width 0.1s ease'
      }}
    >
      {children}

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: '4px',
          height: '100%',
          cursor: 'ew-resize',
          backgroundColor: 'transparent',
          transition: 'background-color 0.2s',
          zIndex: 1000
        }}
        onMouseEnter={(e) => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = '#3b82f6';
          }
        }}
        onMouseLeave={(e) => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      />
    </div>
  );
};
