import { motion } from 'framer-motion';
import { useEffect, useRef, useState, useMemo } from 'react';

const buildKeyframes = (from, steps) => {
  const keys = new Set([...Object.keys(from), ...steps.flatMap(s => Object.keys(s))]);
  const keyframes = {};
  keys.forEach(k => {
    keyframes[k] = [from[k], ...steps.map(s => s[k])];
  });
  return keyframes;
};

const ShiningBlurText = ({
  text = '',
  delay = 150,
  className = '',
  animateBy = 'words',
  direction = 'bottom',
  threshold = 0.1,
  rootMargin = '0px',
  animationFrom,
  animationTo,
  easing = t => t,
  onAnimationComplete,
  stepDuration = 0.35
}) => {
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(ref.current);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, rootMargin]);

  return (
    <motion.p
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        color: '#374151',
        fontWeight: 500,
      }}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.95, opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <motion.span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.8) 35%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.8) 65%, transparent 100%)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
        initial={{
          backgroundPosition: "200% 0"
        }}
        animate={inView ? {
          backgroundPosition: "-200% 0"
        } : {
          backgroundPosition: "200% 0"
        }}
        transition={{
          backgroundPosition: {
            repeat: Infinity,
            duration: 2,
            ease: "linear",
          }
        }}
      >
        {text}
      </motion.span>
      <span style={{ visibility: 'visible' }}>{text}</span>
    </motion.p>
  );
};

export default ShiningBlurText;

