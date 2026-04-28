import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ThinkingIndicator - Premium animated thinking indicator
 * Features: Gradient wave effect + rotating text messages
 * Inspired by ShiningText but with dynamic content
 */
export default function ThinkingIndicator({ message }) {
  const [messageIndex, setMessageIndex] = useState(0);
  
  // Rotating text messages (no icons/emojis as per user request)
  const thinkingMessages = [
    "Analyzing your query...",
    "Reading through your documents...",
    "Processing extracted data...",
    "This may take time for larger documents...",
    "Almost there..."
  ];
  
  // Rotate messages every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % thinkingMessages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);
  
  // Use provided message if available, otherwise use rotating messages
  const displayMessage = message || thinkingMessages[messageIndex];
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      {/* Pulsing dots indicator */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Gradient wave text with smooth transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={displayMessage}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.3 }}
          style={{
            fontSize: '14px',
            fontWeight: '500',
            background: 'linear-gradient(90deg, #6b7280, #3b82f6, #8b5cf6, #3b82f6, #6b7280)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gradient-wave 2s linear infinite',
          }}
        >
          {displayMessage}
        </motion.div>
      </AnimatePresence>
      
      {/* CSS for gradient animation */}
      <style>{`
        @keyframes gradient-wave {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
}
