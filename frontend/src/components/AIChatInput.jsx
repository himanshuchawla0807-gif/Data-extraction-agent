/**
 * AI Chat Input Component - With File Upload and Web Search Toggle
 * Features: Animated pause/send button during upload, web search toggle
 */

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { Paperclip, Send, Globe, Pause, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const PLACEHOLDERS = [
  "Ask about uploaded documents...",
];

export const AIChatInput = ({
  onSendMessage = () => { },
  onFileUpload = () => { },
  onWebSearchToggle = () => { },  // ✅ NEW: Notify parent when toggle changes
  onStopQuery = () => { },        // ✅ NEW: Callback to stop current query
  isUploading = false,
  isProcessing = false,           // ✅ NEW: True when query is being processed (extracting, deep reasoning, etc.)
  uploadProgress = 0
}) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [webSearchActive, setWebSearchActive] = useState(true); // Web search enabled by default
  const [inputValue, setInputValue] = useState("");
  const wrapperRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // ✅ Combine uploading and processing states for button display
  const isWorking = isUploading || isProcessing;

  // Cycle placeholder text when input is inactive
  useEffect(() => {
    if (isActive || inputValue) return;

    const interval = setInterval(() => {
      setShowPlaceholder(false);
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3000);

    return () => clearInterval(interval);
  }, [isActive, inputValue]);

  // Close input when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target)
      ) {
        if (!inputValue) setIsActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputValue]);

  const handleActivate = () => setIsActive(true);

  const handleSend = () => {
    if (inputValue.trim() && !isWorking) {
      onSendMessage({
        message: inputValue,
        webSearchEnabled: webSearchActive
      });
      setInputValue("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isWorking) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0 && onFileUpload) {
      onFileUpload(files);
    }
    e.target.value = ''; // Reset input
  };

  // Button icon variants for smooth animation
  const buttonVariants = {
    send: { rotate: 0, scale: 1 },
    pause: { rotate: 0, scale: 1 },
    loading: { rotate: 360, scale: 1 }
  };

  return (
    <div style={{ width: '100%', padding: '5px 0' }}>
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          maxWidth: '48rem',
          width: '100%',
          margin: '0 auto'
        }}
      >
        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          background: 'rgba(0, 0, 0, 0.05)',
          overflow: 'hidden'
        }}>
          {/* Textarea Container */}
          <div style={{
            overflowY: 'auto',
            maxHeight: '200px'
          }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyPress={handleKeyPress}
              placeholder={!isActive && !inputValue ? PLACEHOLDERS[placeholderIndex] : ''}
              onFocus={handleActivate}
              disabled={isUploading}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '16px',
                lineHeight: '1.2',
                resize: 'none',
                minHeight: '48px',
                maxHeight: '164px',
                overflow: 'auto',
                fontFamily: 'inherit',
                color: '#000',
                opacity: isUploading ? 0.5 : 1
              }}
            />
          </div>

          {/* Upload Progress Bar */}
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: uploadProgress / 100, opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  height: '3px',
                  background: 'linear-gradient(90deg, #0ea5e9, #3b82f6)',
                  transformOrigin: 'left',
                  borderRadius: '2px'
                }}
              />
            )}
          </AnimatePresence>

          {/* Bottom Bar */}
          <div style={{
            height: '48px',
            background: 'rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            position: 'relative'
          }}>
            {/* Left Side - Paperclip and Globe Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Paperclip Button - Now functional */}
              <motion.button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  borderRadius: '8px',
                  padding: '8px',
                  background: 'rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  border: 'none',
                  opacity: isUploading ? 0.5 : 1
                }}
              >
                <Paperclip
                  size={16}
                  style={{
                    color: 'rgba(0, 0, 0, 0.4)',
                    transition: 'color 0.2s'
                  }}
                />
              </motion.button>

              {/* Globe Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  const newValue = !webSearchActive;
                  setWebSearchActive(newValue);
                  onWebSearchToggle(newValue);  // ✅ Notify parent
                }}
                style={{
                  borderRadius: '9999px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 6px',
                  border: webSearchActive ? '1px solid #0ea5e9' : '1px solid transparent',
                  height: '32px',
                  background: webSearchActive ? 'rgba(14, 165, 233, 0.15)' : 'rgba(0, 0, 0, 0.05)',
                  color: webSearchActive ? '#0ea5e9' : 'rgba(0, 0, 0, 0.4)',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <div style={{
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <motion.div
                    animate={{
                      rotate: webSearchActive ? 180 : 0,
                      scale: webSearchActive ? 1.1 : 1,
                    }}
                    whileHover={{
                      rotate: webSearchActive ? 180 : 15,
                      scale: 1.1,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 260,
                      damping: 25,
                    }}
                  >
                    <Globe size={16} />
                  </motion.div>
                </div>

                <AnimatePresence>
                  {webSearchActive && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 'auto', opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        fontSize: '14px',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      Search
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>

            {/* Right Side - Animated Send/Stop Button */}
            <div style={{ position: 'absolute', right: '12px', bottom: '12px' }}>
              <motion.button
                type="button"
                onClick={() => {
                  if (isWorking) {
                    // ✅ Stop button clicked - cancel the query
                    onStopQuery();
                  } else {
                    handleSend();
                  }
                }}
                disabled={!inputValue.trim() && !isWorking}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  borderRadius: '8px',
                  padding: '8px',
                  transition: 'all 0.2s',
                  background: isWorking
                    ? 'rgba(239, 68, 68, 0.15)'  // Red for working/stop
                    : inputValue.trim()
                      ? 'rgba(14, 165, 233, 0.15)'
                      : 'rgba(0, 0, 0, 0.05)',
                  color: isWorking
                    ? '#ef4444'  // Red for working/stop
                    : inputValue.trim()
                      ? '#0ea5e9'
                      : 'rgba(0, 0, 0, 0.4)',
                  border: 'none',
                  cursor: isWorking ? 'pointer' : (inputValue.trim() ? 'pointer' : 'not-allowed'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <AnimatePresence mode="wait">
                  {isWorking ? (
                    <motion.div
                      key="stop"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {/* Stop icon - square */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="5" y="5" width="14" height="14" rx="2" />
                      </svg>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="send"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Send size={16} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>

        {/* Upload status indicator */}
        <AnimatePresence>
          {isUploading && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                marginTop: '8px',
                fontSize: '13px',
                color: '#6B7280',
                textAlign: 'center'
              }}
            >
              Uploading files... {uploadProgress > 0 ? `${uploadProgress}%` : ''}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
