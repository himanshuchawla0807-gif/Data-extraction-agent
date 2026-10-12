import { motion } from "framer-motion";

const BASE_TIMING = 25;

export const Cursor = ({ blink = false, loading = false }) => {
  return (
    <motion.span
      className="cursor-blink"
      animate={{
        opacity: blink || loading ? [1, 0, 1] : 1,
      }}
      transition={{
        duration: blink ? 0.8 : 0.5,
        repeat: blink || loading ? Infinity : 0,
        ease: "easeInOut",
      }}
      style={{
        display: "inline-block",
        width: "2px",
        height: "1em",
        backgroundColor: "currentColor",
        marginLeft: "2px",
        verticalAlign: "middle",
      }}
    />
  );
};

export default Cursor;
