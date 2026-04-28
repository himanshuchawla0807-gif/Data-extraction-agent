/**
 * Three-Section Workspace Layout
 * Files | Chat | Grid
 */

import React, { useState } from 'react';
import SimpleChatInput from './SimpleChatInput';
import { Folder, MessageSquare, Grid3x3, FileText, FolderOpen } from 'lucide-react';

const WorkspaceLayout = ({ files = [], onSendMessage = () => { }, children }) => {
  const [activeTab, setActiveTab] = useState('files'); // 'files', 'chat', or 'grid' (start with files)
  const [messages, setMessages] = useState([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // Ensure files is always an array
  const safeFiles = Array.isArray(files) ? files : [];

  const handleSendMessage = (data) => {
    const newMessage = {
      id: Date.now(),
      text: data.message,
      thinkMode: data.thinkMode,
      deepSearch: data.deepSearch,
      timestamp: new Date(),
      sender: 'user'
    };

    setMessages(prev => [...prev, newMessage]);
    setIsWaitingForResponse(true);

    // Send to backend and provide callback for response
    onSendMessage && onSendMessage(data, (response) => {
      // Add AI response to messages
      const aiMessage = {
        id: Date.now(),
        text: response.text,
        sources: response.sources || [],
        confidence: response.confidence,
        timestamp: new Date(),
        sender: 'ai'
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsWaitingForResponse(false);
    });
  };

  const tabs = [
    { id: 'files', label: 'Files', Icon: Folder },
    { id: 'chat', label: 'Chat', Icon: MessageSquare },
    { id: 'grid', label: 'Grid', Icon: Grid3x3 }
  ];

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f5f5'
    }}>
      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '16px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        {tabs.map(tab => {
          const TabIcon = tab.Icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 24px',
                fontSize: '15px',
                fontWeight: activeTab === tab.id ? '600' : '500',
                color: activeTab === tab.id ? '#1e40af' : '#6b7280',
                background: activeTab === tab.id ? '#eff6ff' : 'transparent',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <TabIcon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Files Section */}
        {activeTab === 'files' && (
          <div style={{
            flex: 1,
            padding: '24px',
            overflowY: 'auto'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '20px',
              color: '#1f2937'
            }}>
              Uploaded Files
            </h2>

            {safeFiles && safeFiles.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                {safeFiles.map((file, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '20px',
                      backgroundColor: '#fff',
                      borderRadius: '12px',
                      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      border: '1px solid #e5e7eb'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px 0 rgba(0, 0, 0, 0.15)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: '12px'
                    }}>
                      <FileText size={48} color="#3b82f6" strokeWidth={1.5} />
                    </div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#1f2937',
                      textAlign: 'center',
                      wordBreak: 'break-word'
                    }}>
                      {file.filename || file.name}
                    </div>
                    {file.size && (
                      <div style={{
                        fontSize: '12px',
                        color: '#9ca3af',
                        textAlign: 'center',
                        marginTop: '4px'
                      }}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#9ca3af'
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <FolderOpen size={64} color="#9ca3af" strokeWidth={1.5} />
                </div>
                <div style={{ fontSize: '16px' }}>No files uploaded yet</div>
              </div>
            )}
          </div>
        )}

        {/* Chat Section */}
        {activeTab === 'chat' && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#fff'
          }}>
            {/* Messages Area */}
            <div style={{
              flex: 1,
              padding: '24px',
              overflowY: 'auto'
            }}>
              {messages.length === 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#9ca3af'
                }}>
                  <div style={{ marginBottom: '16px' }}>
                    <MessageSquare size={64} color="#9ca3af" strokeWidth={1.5} />
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
                    Start a conversation
                  </div>
                  <div style={{ fontSize: '14px' }}>
                    Ask questions about your uploaded documents
                  </div>
                </div>
              ) : (
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        marginBottom: '20px',
                        display: 'flex',
                        justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '12px 16px',
                          borderRadius: '16px',
                          backgroundColor: msg.sender === 'user' ? '#2563eb' : '#f3f4f6',
                          color: msg.sender === 'user' ? '#fff' : '#1f2937',
                          fontSize: '15px',
                          lineHeight: '1.5'
                        }}
                      >
                        {msg.text}
                        {(msg.thinkMode || msg.deepSearch) && (
                          <div style={{
                            marginTop: '8px',
                            fontSize: '12px',
                            opacity: 0.8,
                            display: 'flex',
                            gap: '8px'
                          }}>
                            {msg.thinkMode && <span>Think Mode</span>}
                            {msg.deepSearch && <span>Deep Search</span>}
                          </div>
                        )}
                        {msg.sender === 'ai' && msg.sources && msg.sources.length > 0 && (
                          <div style={{
                            marginTop: '12px',
                            paddingTop: '12px',
                            borderTop: '1px solid #e5e7eb',
                            fontSize: '12px',
                            opacity: 0.8
                          }}>
                            <div style={{ fontWeight: '600', marginBottom: '4px' }}>Sources:</div>
                            {msg.sources.map((source, idx) => (
                              <div key={idx}>📄 {source.filename}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isWaitingForResponse && (
                    <div style={{
                      marginBottom: '20px',
                      display: 'flex',
                      justifyContent: 'flex-start'
                    }}>
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '16px',
                        backgroundColor: '#f3f4f6',
                        color: '#6b7280',
                        fontSize: '15px'
                      }}>
                        <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>Thinking...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat Input at Bottom */}
            <div style={{
              padding: '20px',
              borderTop: '1px solid #e5e7eb',
              backgroundColor: '#fff'
            }}>
              <SimpleChatInput onSendMessage={handleSendMessage} />
            </div>
          </div>
        )}

        {/* Grid/Table Section */}
        {activeTab === 'grid' && (
          <div style={{
            flex: 1,
            backgroundColor: '#fff',
            overflow: 'hidden'
          }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceLayout;

