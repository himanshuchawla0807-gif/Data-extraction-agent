/**
 * Simple Chat Input Component (No animations - React 17 compatible)
 * Professional chat interface with icons
 */

import React, { useState } from "react";
import {
  Lightbulb,
  Mic,
  Globe,
  Paperclip,
  Send
} from "lucide-react";

const SimpleChatInput = ({ onSendMessage = () => {} }) => {
  const [isActive, setIsActive] = useState(false);
  const [thinkActive, setThinkActive] = useState(false);
  const [deepSearchActive, setDeepSearchActive] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleSend = () => {
    if (inputValue.trim() && onSendMessage) {
      onSendMessage({
        message: inputValue,
        thinkMode: thinkActive,
        deepSearch: deepSearchActive
      });
      setInputValue("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0' }}>
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          overflow: 'hidden',
          borderRadius: 24,
          background: '#fff',
          boxShadow: isActive ? '0 8px 32px 0 rgba(0,0,0,0.16)' : '0 2px 8px 0 rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.3s ease',
          padding: '12px'
        }}
      >
        {/* Input Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            style={{
              padding: '10px',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            title="Attach file"
            type="button"
          >
            <Paperclip size={20} />
          </button>

          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            onFocus={() => setIsActive(true)}
            onBlur={() => !inputValue && setIsActive(false)}
            placeholder="Ask about the uploaded documents..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              padding: '10px',
              fontSize: '15px',
              background: 'transparent',
              fontFamily: 'inherit'
            }}
          />

          <button
            style={{
              padding: '10px',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            title="Voice input"
            type="button"
          >
            <Mic size={20} />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: inputValue.trim() ? '#000' : '#9ca3af',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '20px',
              fontWeight: '500',
              border: 'none',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => inputValue.trim() && (e.target.style.backgroundColor = '#3f3f46')}
            onMouseLeave={(e) => inputValue.trim() && (e.target.style.backgroundColor = '#000')}
            title="Send"
            type="button"
          >
            <Send size={18} />
          </button>
        </div>

        {/* Expanded Controls */}
        {(isActive || inputValue) && (
          <div style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            gap: '12px',
            alignItems: 'center'
          }}>
            {/* Think Toggle */}
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                transition: 'all 0.2s',
                fontWeight: '500',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                background: thinkActive ? 'rgba(37, 99, 235, 0.1)' : '#f3f4f6',
                outline: thinkActive ? '2px solid rgba(37, 99, 235, 0.6)' : 'none',
                color: thinkActive ? '#1e3a8a' : '#374151',
              }}
              title="Think"
              type="button"
              onClick={() => setThinkActive(!thinkActive)}
            >
              <Lightbulb size={16} style={{ color: thinkActive ? '#eab308' : 'inherit' }} />
              Think
            </button>

            {/* Deep Search Toggle */}
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                transition: 'all 0.2s',
                fontWeight: '500',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                background: deepSearchActive ? 'rgba(37, 99, 235, 0.1)' : '#f3f4f6',
                outline: deepSearchActive ? '2px solid rgba(37, 99, 235, 0.6)' : 'none',
                color: deepSearchActive ? '#1e3a8a' : '#374151',
              }}
              title="Deep Search"
              type="button"
              onClick={() => setDeepSearchActive(!deepSearchActive)}
            >
              <Globe size={16} />
              Deep Search
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleChatInput;
