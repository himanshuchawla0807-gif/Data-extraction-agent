import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import './TypewriterText.css';

/**
 * TypewriterMarkdown - Typewriter effect with react-markdown rendering
 * Shows inline Oriplex logo spinner that fades away on completion
 * 
 * Props:
 *  - content: Full text content to display
 *  - speed: Characters per frame (default: 3)
 *  - onComplete: Callback when animation finishes
 *  - isNew: If true, animate; if false, show full content immediately
 */
export function TypewriterMarkdown({ content, speed = 8, onComplete, isNew = true }) {
    const [displayedText, setDisplayedText] = useState('');
    const [isComplete, setIsComplete] = useState(!isNew);
    const [isFading, setIsFading] = useState(false);

    useEffect(() => {
        // If not new message or no content, show immediately
        if (!isNew || !content) {
            setDisplayedText(content || '');
            setIsComplete(true);
            return;
        }

        // Reset for new content
        setDisplayedText('');
        setIsComplete(false);
        setIsFading(false);

        let currentIndex = 0;
        const intervalId = setInterval(() => {
            if (currentIndex < content.length) {
                // Reveal characters in batches of 'speed'
                const nextIndex = Math.min(currentIndex + speed, content.length);
                setDisplayedText(content.substring(0, nextIndex));
                currentIndex = nextIndex;
            } else {
                clearInterval(intervalId);
                // Start fade out animation
                setIsFading(true);
                // After fade animation, mark as complete
                setTimeout(() => {
                    setIsComplete(true);
                    if (onComplete) onComplete();
                }, 400);
            }
        }, 10); // ✅ FASTER: 10ms interval instead of 20ms

        return () => clearInterval(intervalId);
    }, [content, speed, isNew, onComplete]);

    // Inline Spinner
    const InlineSpinner = () => (
        <span className={`tw-inline-spinner ${isFading ? 'tw-fading' : ''}`}>
            <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="tw-spinner-svg"
            >
                <circle cx="12" cy="12" r="10" fill="#374151" opacity="0.8" />
            </svg>
        </span>
    );

    // Don't render if no content
    if (!content && !displayedText) {
        return null;
    }

    return (
        <div className="typewriter-container">
            <Markdown
                components={{
                    p: ({ children }) => <p className="tw-paragraph">{children}</p>,
                    strong: ({ children }) => <strong className="tw-bold">{children}</strong>,
                    em: ({ children }) => <em className="tw-italic">{children}</em>,
                    ul: ({ children }) => <ul className="tw-list">{children}</ul>,
                    ol: ({ children }) => <ol className="tw-list-ordered">{children}</ol>,
                    li: ({ children }) => <li className="tw-list-item">{children}</li>,
                    h1: ({ children }) => <h1 className="tw-h1">{children}</h1>,
                    h2: ({ children }) => <h2 className="tw-h2">{children}</h2>,
                    h3: ({ children }) => <h3 className="tw-h3">{children}</h3>,
                    a: ({ href, children }) => (
                        <a href={href} className="tw-link" target="_blank" rel="noopener noreferrer">
                            {children}
                        </a>
                    ),
                    code: ({ inline, children }) =>
                        inline ? (
                            <code className="tw-code-inline">{children}</code>
                        ) : (
                            <pre className="tw-code-block"><code>{children}</code></pre>
                        ),
                    blockquote: ({ children }) => <blockquote className="tw-quote">{children}</blockquote>,
                }}
            >
                {displayedText}
            </Markdown>
            {!isComplete && <InlineSpinner />}
        </div>
    );
}

export default TypewriterMarkdown;
