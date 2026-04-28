/**
 * Simple logging utility to reduce console noise.
 * Control verbosity with a single flag.
 */

const DEBUG_MODE = true; // Set to true for verbose logging

const logger = {
    debug: (...args) => {
        if (DEBUG_MODE) console.debug('[DEBUG]', ...args);
    },

    info: (...args) => {
        if (DEBUG_MODE) console.info('[INFO]', ...args);
    },

    warn: (...args) => {
        console.warn('[WARN]', ...args);
    },

    error: (...args) => {
        console.error('[ERROR]', ...args);
    },

    // For critical Application events that should always be visible
    important: (...args) => {
        console.log('[APP]', ...args);
    }
};

export default logger;
