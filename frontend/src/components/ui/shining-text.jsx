"use client";

import * as React from "react";
import { motion } from "framer-motion";

/**
 * Premium AI Thinking Animation
 * Inspired by ChatGPT and Perplexity AI thinking indicators
 * Features: Smooth gradient wave, pulsing dots, elegant transitions
 */
export function ShiningText({ text, variant = "default" }) {
  // Split text for character-by-character animation
  const characters = text.split("");

  return (
    <div className="flex items-center gap-3">
      {/* Pulsing dots indicator */}
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
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

      {/* Gradient wave text */}
      <motion.div
        className="text-sm font-medium"
        style={{
          background: "linear-gradient(90deg, #6b7280, #3b82f6, #8b5cf6, #3b82f6, #6b7280)",
          backgroundSize: "200% auto",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
        animate={{
          backgroundPosition: ["0% center", "200% center"],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        {text}
      </motion.div>
    </div>
  );
}

/**
 * Thinking Status Component
 * Shows structured thinking steps with clean presentation
 */
export function ThinkingStatus({ steps = [], currentStep = "" }) {
  return (
    <div className="flex flex-col gap-2">
      {/* Current thinking step with animation */}
      {currentStep && (
        <div className="flex items-center gap-3">
          <motion.div
            className="w-2 h-2 rounded-full bg-blue-500"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <motion.span
            className="text-sm text-gray-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              background: "linear-gradient(90deg, #4b5563, #3b82f6, #4b5563)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {currentStep}
          </motion.span>
        </div>
      )}

      {/* Completed steps (subtle, grayed out) */}
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center gap-3 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * ProcessingIndicator - Premium loading animation
 * Use this for general processing states
 */
export function ProcessingIndicator({ message = "Processing..." }) {
  return (
    <motion.div
      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated spinner */}
      <motion.div
        className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />

      {/* Message with gradient */}
      <span
        className="text-sm font-medium"
        style={{
          background: "linear-gradient(90deg, #374151, #3b82f6, #374151)",
          backgroundSize: "200% auto",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {message}
      </span>
    </motion.div>
  );
}
