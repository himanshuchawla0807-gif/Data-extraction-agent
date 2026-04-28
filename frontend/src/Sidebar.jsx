import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ShiningText } from './components/ui/shining-text';
import { AIChatInput } from './components/AIChatInput';
import oriplexLogo from './img/oriplex-logo.svg'; // Still used for AI message avatars
import { TypewriterMarkdown } from './components/TypewriterMarkdown';
import ThinkingIndicator from './components/ThinkingIndicator'; // ✅ NEW: Rotating messages

export default function Sidebar({
  sessionId,
  onSendChatMessage,
  conversationHistory = [],
  uploadedFiles = [],
  pendingModification,
  onAcceptModification,
  onRejectModification,
  isChatTyping = false,
  thinkingMessage = "Oriplex is thinking...",
  extractionLogs = [],
  onFileUpload, // NEW: Handler for file uploads from sidebar
  uploadStatus = 'idle', // NEW: Track upload status for button animation
  onWebSearchToggle, // ✅ Handler for web search toggle
  onStopQuery, // ✅ NEW: Handler to stop current query
  chatTitle = 'New Research' // ✅ Dynamic chat title
}) {
  // Track the ID of the last rendered message to detect new ones needing animation
  const lastRenderedIdRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationHistory]);

  const handleSendMessage = (data) => {
    if (onSendChatMessage) {
      onSendChatMessage(data);
    }
  };


  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Clean Header - Dynamic Chat Title with Fade Animation */}
      <div style={{
        borderBottom: '1px solid #e5e7eb',
        padding: '20px 24px',
        flexShrink: 0
      }}>
        <div
          key={chatTitle}
          style={{
            fontSize: '15px',
            fontWeight: '600',
            color: '#111827',
            lineHeight: '1.3',
            maxWidth: '280px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            animation: 'fadeInTitle 0.4s ease-out forwards',
            opacity: 0
          }}
          title={chatTitle}
        >
          {chatTitle}
        </div>
        <style>{`
          @keyframes fadeInTitle {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>

      {/* Documents with Read Indicators - REMOVED per user request */}

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px'
      }}>
        {conversationHistory.map((message, index) => {
          // Canonical shape: role ('user', 'ai', 'system')
          // Fallback to sender for backward compatibility if needed during migration
          const isUser = message.role === 'user' || message.sender === 'user';
          const nextMessage = conversationHistory[index + 1];
          const nextIsUser = nextMessage && (nextMessage.role === 'user' || nextMessage.sender === 'user');

          // Add extra spacing when switching from user to agent or vice versa
          const extraSpacing = isUser !== nextIsUser ? '40px' : '28px';

          return (
            <div
              key={message.id || index}
              style={{
                marginBottom: extraSpacing
              }}
            >
              {isUser ? (
                /* User Message */
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#111827',
                  color: '#ffffff',
                  borderRadius: '10px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  marginLeft: 'auto',
                  maxWidth: '85%',
                  width: 'fit-content',
                  float: 'right',
                  clear: 'both'
                }}>
                  {message.content || message.text}
                </div>
              ) : (
                /* Agent Message */
                <div style={{
                  display: 'flex',
                  gap: '14px',
                  clear: 'both'
                }}>
                  <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <img
                      src={oriplexLogo}
                      alt=""
                      style={{
                        width: '18px',
                        height: '18px',
                        filter: 'invert(1)'
                      }}
                    />
                  </div>
                  <div style={{
                    flex: 1,
                    padding: '12px 16px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '10px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: '#111827'
                  }}>
                    {/* ✅ NEW: Markdown rendering with typewriter animation for latest message */}
                    <TypewriterMarkdown
                      content={message.content || message.text || ''}
                      speed={4}
                      isNew={index === conversationHistory.length - 1 && !message.animated}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Thinking Indicator with ShiningText */}
        {isChatTyping && (
          <div style={{
            display: 'flex',
            gap: '14px',
            marginTop: '32px',
            clear: 'both'
          }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: '#111827',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '2px'
            }}>
              <img
                src={oriplexLogo}
                alt=""
                style={{
                  width: '18px',
                  height: '18px',
                  filter: 'invert(1)'
                }}
              />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '8px'
            }}>
              {/* ✅ NOW USING ThinkingIndicator with rotating messages */}
              <ThinkingIndicator />
            </div>
          </div>
        )}

        {/* ✅ REMOVED: Terminal logs - developer-facing info removed from UI */}
        {/* File parsing logs are now only visible in backend console */}

        {/* Scroll target for auto-scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Modification */}
      {pendingModification && (
        <div style={{
          margin: '0 24px 20px',
          padding: '14px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '10px',
          flexShrink: 0
        }}>
          <div style={{
            fontSize: '13px',
            color: '#1e40af',
            marginBottom: '12px',
            lineHeight: '1.5'
          }}>
            {pendingModification.message}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onAcceptModification}
              style={{
                flex: 1,
                padding: '8px 14px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            >
              Enable
            </button>
            <button
              onClick={onRejectModification}
              style={{
                flex: 1,
                padding: '8px 14px',
                backgroundColor: '#e5e7eb',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d1d5db'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Modern AI Chat Input */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        padding: '0',
        flexShrink: 0
      }}>
        <AIChatInput
          onSendMessage={handleSendMessage}
          onStopQuery={onStopQuery}
          isUploading={uploadStatus === 'uploading' || uploadStatus === 'processing'}
          isProcessing={isChatTyping}
          uploadProgress={0}
          onFileUpload={onFileUpload}
          onWebSearchToggle={onWebSearchToggle}  // ✅ CRITICAL: Connect toggle to parent!
        />
        <p style={{
          textAlign: 'center',
          fontSize: '12px',
          color: '#878f9bff',
          padding: '4px 0 6px',
          margin: 0
        }}>
          Oriplex can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
