import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export const Delay = ({ children, delay }) => {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setDone(true), delay);
    return () => clearTimeout(showTimer);
  }, [delay]);

  return <motion.span layout="size">{done ? children : null}</motion.span>;
};
