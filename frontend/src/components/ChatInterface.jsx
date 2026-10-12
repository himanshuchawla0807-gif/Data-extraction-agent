import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, Minimize2, Maximize2 } from 'lucide-react';
import './ChatInterface.css';

/**
 * ChatInterface Component - Conversational interface with memory
 * Shows chat history and maintains context across messages
 */
export default function ChatInterface({
  sessionId,
  onSendMessage,
  conversationHistory = [],
  isMinimized = false,
  onToggleMinimize
}) {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Update messages when conversation history changes
  useEffect(() => {
    if (conversationHistory && conversationHistory.length > 0) {
      setMessages(conversationHistory);
    }
  }, [conversationHistory]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      // Add user message to UI immediately
      const userMessage = {
        role: 'user',
        content: inputValue,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, userMessage]);

      // Send to backend
      if (onSendMessage) {
        onSendMessage(inputValue);
      }

      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isMinimized) {
    return (
      <div className="chat-interface-minimized">
        <button
          className="chat-restore-btn"
          onClick={onToggleMinimize}
          title="Open chat"
        >
          <MessageCircle size={20} />
          <span>Chat</span>
          {messages.length > 0 && (
            <span className="message-count">{messages.length}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-title">
          <MessageCircle size={18} />
          <h3>Chat with Oriplex</h3>
        </div>
        <div className="chat-header-actions">
          <button
            className="chat-action-btn"
            onClick={onToggleMinimize}
            title="Minimize"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <MessageCircle size={48} style={{ opacity: 0.3 }} />
            <p>Start a conversation</p>
            <span>Ask me to extract data, analyze documents, or chat naturally</span>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat-message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}
              >
                <div className="message-avatar">
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className="message-content">
                  <div className="message-text">{msg.content}</div>
                  {msg.timestamp && (
                    <div className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="chat-input-container">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          className="chat-input"
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className="chat-send-btn"
          title="Send message"
        >
          <Send size={18} />
        </button>
      </div>

      {/* Memory indicator */}
      <div className="chat-memory-indicator">
        <span className="memory-dot"></span>
        <span>Context maintained</span>
      </div>
    </div>
  );
}
