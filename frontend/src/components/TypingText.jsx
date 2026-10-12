import React, { useRef, useEffect, useState } from 'react';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import './TypingText.css';

// Delay component - renders child after specified delay
const Delay = ({ children, delay }) => {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setDone(true), delay);
    return () => clearTimeout(showTimer);
  }, [delay]);

  return <motion.span layout="size">{done ? children : null}</motion.span>;
};

// Cursor component - blinks when waiting
const Cursor = ({ blink, loading }) => {
  if (!loading) return null;

  return (
    <motion.span
      className={`typing-cursor ${blink ? 'blink' : ''}`}
      animate={{ opacity: blink ? [1, 0.3, 1] : 1 }}
      transition={{ duration: 0.8, repeat: blink ? Infinity : 0 }}
    >
      |
    </motion.span>
  );
};

// Probabilistic timing generator
const randomizer = (probabilities) => {
  const random = Math.random();
  let cumulative = 0;

  for (let prob of probabilities) {
    cumulative += prob.probability;
    if (random <= cumulative) {
      return prob.value;
    }
  }

  return probabilities[0].value;
};

// Character animation variants
const characterAnimation = {
  hidden: {
    opacity: 0,
    y: 10,
    filter: 'blur(2px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
  },
};

// Main TypingText component
export default function TypingText({ text, onComplete }) {
  const prevTiming = useRef(0);
  const [finished, setFinished] = useState(false);

  // Probabilistic timing for natural feel
  const probabilities = [
    { value: 25, probability: 0.75 },   // 75% chance of fast (25ms)
    { value: 50, probability: 0.18 },   // 18% chance of medium (50ms) - "thinking"
    { value: 85, probability: 0.07 },   // 7% chance of slow (85ms) - "thinking harder"
  ];

  // Reset timing on text change
  useEffect(() => {
    prevTiming.current = 0;
    setFinished(false);
  }, [text]);

  // Call onComplete when typing finishes
  useEffect(() => {
    if (text && !finished) {
      const totalTime = text.split('').reduce((acc) => {
        const timing = randomizer(probabilities);
        return acc + timing;
      }, 0);

      const timer = setTimeout(() => {
        setFinished(true);
        if (onComplete) onComplete();
      }, totalTime + 100);

      return () => clearTimeout(timer);
    }
  }, [text, finished, onComplete]);

  if (!text) return null;

  return (
    <LayoutGroup id="typing-text">
      <AnimatePresence mode="sync">
        <motion.div
          className="typing-text-container"
          initial="hidden"
          animate="visible"
        >
          {text.split('').map((char, idx) => {
            const probTiming = randomizer(probabilities);
            const newTiming = prevTiming.current + probTiming;
            prevTiming.current = newTiming;

            return (
              <Delay key={idx} delay={newTiming}>
                <motion.span
                  variants={characterAnimation}
                  transition={{
                    duration: 0.15,
                    ease: 'easeOut',
                  }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              </Delay>
            );
          })}
          <AnimateCursorOnWait loading={!finished} />
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  );
}

// Cursor that animates based on layout changes
function AnimateCursorOnWait({ loading }) {
  const [waiting, setWaiting] = useState(false);
  const [finished, setFinished] = useState(false);
  const thinkingTimer = useRef();
  const finishedTimer = useRef();

  return (
    <motion.div
      className="cursor-container"
      layout="position"
      animate={{ top: 0 }}
      transition={{
        layout: { duration: 0.1 },
      }}
      onLayoutAnimationStart={() => {
        setWaiting(false);
        if (finishedTimer.current) clearInterval(finishedTimer.current);
      }}
      onLayoutAnimationComplete={() => {
        if (thinkingTimer.current) clearInterval(thinkingTimer.current);
        if (finishedTimer.current) clearInterval(finishedTimer.current);
        thinkingTimer.current = setTimeout(() => setWaiting(true), 30);
        finishedTimer.current = setTimeout(() => setFinished(true), 1500);
      }}
    >
      <Cursor blink={waiting} loading={!finished && loading} />
    </motion.div>
  );
}
