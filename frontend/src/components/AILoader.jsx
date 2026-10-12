/**
 * AI Loader Component - User Provided
 * Shows during data generation
 */

import * as React from "react";

export const AILoader = ({ size = 180, text = "Generating" }) => {
  const letters = text.split("");

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(to bottom, #ffffff, #f3f4f6, #e5e7eb)'
    }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          userSelect: 'none',
          width: size,
          height: size
        }}
      >
        {/* Letters */}
        {letters.map((letter, index) => (
          <span
            key={index}
            style={{
              display: 'inline-block',
              color: '#1f2937',
              opacity: 0.4,
              animation: `loaderLetter 3s infinite`,
              animationDelay: `${index * 0.1}s`,
              fontSize: '1.5rem',
              fontWeight: '600'
            }}
          >
            {letter}
          </span>
        ))}

        {/* Spinning circle */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            animation: 'loaderCircle 5s linear infinite'
          }}
        ></div>
      </div>

      <style jsx>{`
        @keyframes loaderCircle {
          0% {
            transform: rotate(90deg);
            box-shadow:
              0 6px 12px 0 #38bdf8 inset,
              0 12px 18px 0 #2563eb inset,
              0 36px 36px 0 #1e40af inset,
              0 0 3px 1.2px rgba(56, 189, 248, 0.3),
              0 0 6px 1.8px rgba(37, 99, 235, 0.2);
          }
          50% {
            transform: rotate(270deg);
            box-shadow:
              0 6px 12px 0 #60a5fa inset,
              0 12px 6px 0 #3b82f6 inset,
              0 24px 36px 0 #2563eb inset,
              0 0 3px 1.2px rgba(96, 165, 250, 0.3),
              0 0 6px 1.8px rgba(59, 130, 246, 0.2);
          }
          100% {
            transform: rotate(450deg);
            box-shadow:
              0 6px 12px 0 #4dc8fd inset,
              0 12px 18px 0 #2563eb inset,
              0 36px 36px 0 #1e40af inset,
              0 0 3px 1.2px rgba(77, 200, 253, 0.3),
              0 0 6px 1.8px rgba(37, 99, 235, 0.2);
          }
        }

        @keyframes loaderLetter {
          0%,
          100% {
            opacity: 0.4;
            transform: translateY(0);
          }
          20% {
            opacity: 1;
            transform: scale(1.15);
          }
          40% {
            opacity: 0.7;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
