import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, PanelLeftClose, PanelLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { VariableSizeList } from 'react-window';
import * as pdfjsLib from 'pdfjs-dist';
import { API_ROOT } from '../config';  // ✅ Import backend URL for PDF serving
import './PDFViewer.css';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// Helper: Levenshtein distance for fuzzy matching
const levenshteinDistance = (a, b) => {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + cost
            );
        }
    }
    return matrix[b.length][a.length];
};

// Helper: Tokenize text for multi-word matching
const tokenizeChunk = (text) => {
    return text.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 3); // Ignore short words
};

// Default page height estimate (updated after rendering)
const DEFAULT_PAGE_HEIGHT = 800;

// PageRenderer component for react-window virtualization
const PageRenderer = React.memo(({ index, style, data }) => {
    const { pdfDoc, scale, chunkText, pageHeights, setPageHeight, highlightPage } = data;
    const pageNum = index + 1;
    const canvasRef = useRef(null);
    const highlightCanvasRef = useRef(null);
    const textLayerRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        let renderTask = null;  // ✅ FIX: Track render task for cancellation
        if (!pdfDoc || !canvasRef.current) return;

        const renderPage = async () => {
            try {
                const page = await pdfDoc.getPage(pageNum);
                if (cancelled) return;

                const viewport = page.getViewport({ scale });
                const canvas = canvasRef.current;
                if (!canvas) return;  // Canvas may have unmounted

                const context = canvas.getContext('2d');

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // ✅ FIX: Store render task and handle cancellation
                renderTask = page.render({ canvasContext: context, viewport });
                await renderTask.promise;
                if (cancelled) return;

                // Update page height for accurate scrolling
                const actualHeight = viewport.height + 24; // Add padding
                if (pageHeights[index] !== actualHeight) {
                    setPageHeight(index, actualHeight);
                }

                // Render text layer
                if (textLayerRef.current) {
                    await renderTextLayer(page, viewport, textLayerRef.current, () => cancelled);
                }

                // ✅ FIX: Only highlight on the specific page that contains the chunk
                // This prevents highlighting on ALL pages
                if (chunkText && !cancelled && (highlightPage === pageNum || !highlightPage)) {
                    await highlightChunk(page, viewport, chunkText, highlightCanvasRef.current, () => cancelled, scale);
                }
            } catch (err) {
                // ✅ FIX: Ignore cancellation errors
                if (err?.name === 'RenderingCancelledException' || cancelled) {
                    return;
                }
                console.error(`Error rendering page ${pageNum}:`, err);
            }
        };

        renderPage();

        return () => {
            cancelled = true;
            // ✅ FIX: Cancel any pending render task
            if (renderTask) {
                renderTask.cancel();
            }
        };
    }, [pdfDoc, pageNum, scale, chunkText, index, pageHeights, setPageHeight]);

    // Render Text Layer
    const renderTextLayer = async (page, viewport, container, isCancelled) => {
        const textContent = await page.getTextContent();
        if (isCancelled && isCancelled()) return;

        container.innerHTML = '';

        textContent.items.forEach(item => {
            if (isCancelled && isCancelled()) return;
            const tx = pdfjsLib.Util.transform(
                viewport.transform,
                item.transform
            );

            // Calculate font height from transform matrix
            const fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));

            const span = document.createElement('span');
            span.textContent = item.str;
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - fontHeight}px`; // Adjust for baseline
            span.style.fontSize = `${fontHeight}px`;
            span.style.fontFamily = item.fontName;

            container.appendChild(span);
        });
    };

    // ✅ IMPROVED: Highlight the specific chunk as a contiguous block, not individual keywords
    const highlightChunk = async (page, viewport, text, highlightCanvas, isCancelled, currentScale) => {
        console.log('[HIGHLIGHT] highlightChunk called:', {
            pageNum: page.pageNumber,
            textLength: text?.length,
            textPreview: text?.substring(0, 100),
            hasCanvas: !!highlightCanvas
        });

        if (!highlightCanvas || !text) {
            console.log('[HIGHLIGHT] Skipping - no canvas or text');
            return;
        }

        const textContent = await page.getTextContent();
        if (isCancelled && isCancelled()) return;

        const ctx = highlightCanvas.getContext('2d');
        highlightCanvas.width = viewport.width;
        highlightCanvas.height = viewport.height;
        ctx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

        // Normalize the chunk text for comparison
        const normalizedChunk = text.toLowerCase().replace(/\s+/g, ' ').trim();

        // Build a map of text items with their positions
        const textItems = textContent.items.map((item, idx) => ({
            idx,
            str: item.str,
            normalizedStr: item.str.toLowerCase().replace(/\s+/g, ' ').trim(),
            transform: item.transform
        }));

        // ✅ NEW APPROACH: Keyword-based matching instead of phrase matching
        // Extract distinctive keywords and numbers from the chunk
        const cleanChunk = normalizedChunk.replace(/[^\w\s\d]/g, ' ').replace(/\s+/g, ' ');
        const words = cleanChunk.split(' ').filter(w => w.length > 3);

        // Extract distinctive numbers (3+ digits) - very reliable for financial docs
        const numbers = normalizedChunk.match(/\d[\d,\.]+/g)?.filter(n => n.length >= 3) || [];

        // Take unique keywords (skip common words)
        const commonWords = ['the', 'and', 'for', 'from', 'with', 'that', 'this', 'year', 'ended', 'december', 'million', 'thousands', 'total', 'income', 'expense'];
        const keywords = words.filter(w => !commonWords.includes(w) && w.length > 4).slice(0, 20);

        console.log('[HIGHLIGHT] Matching with:', {
            keywordCount: keywords.length,
            keywords: keywords.slice(0, 5),
            numbers: numbers.slice(0, 3)
        });

        // Score each text item by how many keywords/numbers it contains
        const itemScores = textItems.map((item, idx) => {
            let score = 0;
            const itemText = item.normalizedStr.toLowerCase();

            // Check for keyword matches
            for (const kw of keywords) {
                if (itemText.includes(kw)) {
                    score += 1;
                }
            }

            // Check for number matches (highly weighted)
            for (const num of numbers.slice(0, 5)) {
                if (itemText.includes(num)) {
                    score += 3; // Numbers are more distinctive
                }
            }

            return { idx, score, str: item.str };
        });

        // Find clusters of high-scoring items (the highlight region)
        let matchStartIdx = -1;
        let matchEndIdx = -1;
        let bestClusterScore = 0;

        // Scan for clusters of 5+ consecutive items with scores
        for (let i = 0; i < itemScores.length - 5; i++) {
            let clusterScore = 0;
            for (let j = i; j < Math.min(i + 20, itemScores.length); j++) {
                clusterScore += itemScores[j].score;
            }

            if (clusterScore > bestClusterScore && clusterScore >= 3) {
                bestClusterScore = clusterScore;
                matchStartIdx = i;

                // Find where the cluster ends (extend while still scoring)
                matchEndIdx = i;
                for (let j = i; j < Math.min(i + 40, itemScores.length); j++) {
                    if (itemScores[j].score > 0) {
                        matchEndIdx = j;
                    }
                }
            }
        }

        console.log('[HIGHLIGHT] Match result:', {
            matchStartIdx, matchEndIdx,
            itemCount: textItems.length,
            bestClusterScore,
            hasMatch: matchStartIdx !== -1 && matchEndIdx !== -1
        });

        // Highlight the matched range of text items
        if (matchStartIdx !== -1 && matchEndIdx !== -1) {
            for (let i = matchStartIdx; i <= matchEndIdx; i++) {
                if (isCancelled && isCancelled()) return;
                const item = textContent.items[i];
                if (!item || !item.str.trim()) continue;

                const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
                const x = transform[4];
                const y = transform[5];
                const fontHeight = Math.sqrt((transform[2] * transform[2]) + (transform[3] * transform[3]));
                const width = item.str.length * fontHeight * 0.6;

                ctx.fillStyle = 'rgba(252, 211, 77, 0.4)'; // Soft amber/yellow fill - highly visible
                ctx.strokeStyle = '#1e40af'; // Dark blue border
                ctx.lineWidth = 2; // Thicker border for visibility
                ctx.shadowColor = 'rgba(30, 64, 175, 0.3)'; // Subtle shadow for depth
                ctx.shadowBlur = 4;
                ctx.fillRect(x, y - fontHeight, Math.max(width, 10), fontHeight * 1.2);
                // Reset shadow for next iteration
                ctx.shadowBlur = 0;
            }

            // Draw a border around the entire highlighted region for clarity
            // (Optional: Could calculate bounding box for all items and draw one big rect)
        }
    };

    return (
        <div style={style} className="pdf-page-container" ref={containerRef}>
            <div className="pdf-page-wrapper">
                <canvas ref={canvasRef} />
                <canvas ref={highlightCanvasRef} className="highlight-overlay" />
                <div ref={textLayerRef} className="text-layer" />
            </div>
        </div>
    );
});

PageRenderer.displayName = 'PageRenderer';

const PDFViewer = ({ isOpen, onClose, filename, chunkText, citations = [], sessionId, sessionFilesMap }) => {
    const [pdfDoc, setPdfDoc] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.2);
    const [thumbnails, setThumbnails] = useState([]);
    const [pageHeights, setPageHeights] = useState([]);
    const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
    const [showThumbnails, setShowThumbnails] = useState(true);

    // ✅ NEW: Citation navigation state
    const [currentCitationIndex, setCurrentCitationIndex] = useState(0);

    // ✅ NEW: Track which page should be highlighted (prevents highlighting on all pages)
    const [highlightPage, setHighlightPage] = useState(null);

    // Derive active chunk text from citations array or fallback to single chunkText
    const activeCitations = citations.length > 0 ? citations : (chunkText ? [{ excerpt: chunkText }] : []);
    const activeChunk = activeCitations[currentCitationIndex]?.excerpt || chunkText || '';

    // ⚠️ CRITICAL: Use window-based calculation for initial height, not hardcoded 600
    // This prevents the PDF from being cut off on first render
    const [listHeight, setListHeight] = useState(() => {
        // Fallback calculation: viewport height minus header(56px) and controls(48px)
        return typeof window !== 'undefined' ? window.innerHeight - 104 : 600;
    });

    const listRef = useRef(null);
    const listContainerRef = useRef(null);
    const thumbnailRefs = useRef({});
    const scrollTimeoutRef = useRef(null);

    // Update page height callback for VariableSizeList
    const setPageHeight = useCallback((index, height) => {
        setPageHeights(prev => {
            const newHeights = [...prev];
            newHeights[index] = height;
            return newHeights;
        });
        // Reset list cache when height changes
        if (listRef.current) {
            listRef.current.resetAfterIndex(index);
        }
    }, []);

    // Get item size for VariableSizeList
    const getItemSize = useCallback((index) => {
        return pageHeights[index] || DEFAULT_PAGE_HEIGHT;
    }, [pageHeights]);

    // Data passed to PageRenderer - use activeChunk (from current citation) for highlighting
    const itemData = useMemo(() => ({
        pdfDoc,
        scale,
        chunkText: activeChunk, // ✅ Use excerpt from current citation
        pageHeights,
        setPageHeight,
        highlightPage  // ✅ Pass which page to highlight (prevents all-page highlighting)
    }), [pdfDoc, scale, activeChunk, pageHeights, setPageHeight, highlightPage]);

    // Handle scroll to calculate current visible page (debounced)
    const handleScroll = useCallback(({ scrollOffset }) => {
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = setTimeout(() => {
            let cumulativeHeight = 0;
            let pageIndex = null;
            for (let i = 0; i < totalPages; i++) {
                const pageHeight = pageHeights[i] || DEFAULT_PAGE_HEIGHT;
                if (scrollOffset < cumulativeHeight + pageHeight / 2) {
                    pageIndex = i + 1;
                    break;
                }
                cumulativeHeight += pageHeight;
            }
            // Fallback to last page if loop completes without match
            setCurrentVisiblePage(pageIndex !== null ? pageIndex : totalPages);
        }, 100); // 100ms debounce
    }, [totalPages, pageHeights]);

    // Load PDF and Generate Thumbnails
    useEffect(() => {
        let uniqueTaskFlag = false; // Cleanup flag
        if (!isOpen || !filename || !sessionId) return;

        const loadPDF = async () => {
            setThumbnails([]);
            setPdfDoc(null);
            setTotalPages(0);
            setPageHeights([]);
            setCurrentVisiblePage(1);

            // ✅ FIX: Extract just the basename from filename (in case it's a full path)
            // This handles cases where file_path is passed instead of just filename
            let cleanFilename = filename;
            if (cleanFilename.includes('\\') || cleanFilename.includes('/')) {
                // Extract basename - handle both Windows and Unix paths
                const parts = cleanFilename.split(/[\\/]/);
                cleanFilename = parts[parts.length - 1];
                console.log('[PDF_VIEWER] Extracted basename from path:', { original: filename, cleaned: cleanFilename });
            }

            // ✅ Resolve actual filename using mapping (fallback to cleaned filename)
            let actualFilename = sessionFilesMap?.get(cleanFilename) || cleanFilename;

            // ✅ FIX: Also clean actualFilename in case sessionFilesMap returns full path
            if (actualFilename.includes('\\') || actualFilename.includes('/')) {
                const parts = actualFilename.split(/[\\/]/);
                actualFilename = parts[parts.length - 1];
                console.log('[PDF_VIEWER] Cleaned actualFilename path:', actualFilename);
            }

            // ✅ FIX: Use absolute backend URL for PDF serving (relative URLs don't work in production iframe)
            // API_ROOT points to data-extraction-backend Cloud Run service
            const signedUrlEndpoint = `${API_ROOT}/api/data-extraction/view-pdf?filename=${encodeURIComponent(actualFilename)}`;
            const fallbackUrl = `${API_ROOT}/api/data-extraction/files/${sessionId}/${encodeURIComponent(actualFilename)}`;

            console.log('[PDF_VIEWER] Resolving filename:', {
                displayName: filename,
                cleanFilename,
                actualFilename,
                signedUrlEndpoint,
                fallbackUrl,
                foundInMap: sessionFilesMap?.has(cleanFilename)
            });

            // ✅ STEP 1: Check Local Cache for Signed URL (Instant Load)
            const cacheKey = `pdf_url_${sessionId}_${encodeURIComponent(actualFilename)}`;
            const cachedUrl = sessionStorage.getItem(cacheKey);
            const cachedTimestamp = sessionStorage.getItem(`${cacheKey}_ts`);

            // Check if cache is valid (less than 24 hours old)
            const isCacheValid = cachedUrl && cachedTimestamp && (Date.now() - parseInt(cachedTimestamp) < 24 * 60 * 60 * 1000);

            let pdfUrl = null;
            let pdf;

            if (isCacheValid) {
                console.log('[PDF_VIEWER] ⚡ Cache Hit! Using cached signed URL');
                pdfUrl = cachedUrl;
            } else {
                // Fetch fresh from backend
                try {
                    console.log('[PDF_VIEWER] Fetching signed URL from:', signedUrlEndpoint);
                    const response = await fetch(signedUrlEndpoint);

                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.url) {
                            pdfUrl = data.url;
                            console.log('[PDF_VIEWER] ✅ Got signed URL from Firebase Storage');

                            // Cache the result
                            try {
                                sessionStorage.setItem(cacheKey, pdfUrl);
                                sessionStorage.setItem(`${cacheKey}_ts`, Date.now().toString());
                            } catch (e) {
                                console.warn('Failed to cache PDF URL (quota exceeded?)');
                            }
                        } else {
                            console.warn('[PDF_VIEWER] Backend returned no URL, trying fallback');
                        }
                    } else {
                        console.warn('[PDF_VIEWER] Backend returned status:', response.status);
                    }
                } catch (fetchError) {
                    console.warn('[PDF_VIEWER] Failed to fetch signed URL:', fetchError.message);
                }
            }

            // ✅ STEP 2: Load PDF from signed URL or fallback
            try {
                if (pdfUrl) {
                    console.log('[PDF_VIEWER] Loading PDF from signed URL');
                    const loadingTask = pdfjsLib.getDocument(pdfUrl);
                    pdf = await loadingTask.promise;
                } else {
                    // Fallback to direct file endpoint
                    console.log('[PDF_VIEWER] Trying fallback URL:', fallbackUrl);
                    const fallbackTask = pdfjsLib.getDocument(fallbackUrl);
                    pdf = await fallbackTask.promise;
                    // Dont cache fallback URLs as they might ideally be replaced by signed URLs later
                }
            } catch (pdfError) {
                console.error('[PDF_VIEWER] Failed to load PDF:', pdfError.message);
                return; // Exit if loading fails
            }

            if (uniqueTaskFlag || !pdf) return;

            setPdfDoc(pdf);
            setTotalPages(pdf.numPages);
            setPageHeights(new Array(pdf.numPages).fill(DEFAULT_PAGE_HEIGHT));

            // Generate thumbnails in batches
            let pagesProcessed = 0;
            const BATCH_SIZE = 5;

            const generateThumbnailsBatch = async () => {
                if (uniqueTaskFlag) return;
                if (pagesProcessed >= pdf.numPages) return;

                const batch = [];
                const limit = Math.min(pagesProcessed + BATCH_SIZE, pdf.numPages);

                for (let i = pagesProcessed + 1; i <= limit; i++) {
                    if (uniqueTaskFlag) return;
                    try {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 0.2 });
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        await page.render({ canvasContext: context, viewport }).promise;
                        batch.push({ pageNum: i, dataUrl: canvas.toDataURL('image/png') });
                    } catch (err) {
                        console.error(`Error generating thumbnail for page ${i}:`, err);
                    }
                }

                if (uniqueTaskFlag) return;

                setThumbnails(prev => [...prev, ...batch]);
                pagesProcessed = limit;

                if (pagesProcessed < pdf.numPages) {
                    setTimeout(generateThumbnailsBatch, 100);
                }
            };

            generateThumbnailsBatch();
        };

        loadPDF();

        return () => {
            uniqueTaskFlag = true;
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [isOpen, filename, sessionId, sessionFilesMap]);

    // Auto-scroll to first chunk match when activeChunk changes (including citation navigation)
    useEffect(() => {
        if (!pdfDoc || !activeChunk || !listRef.current) return;

        // ✅ IMPROVED: Multi-tier phrase-based page matching
        const findMatchingPage = async () => {
            // Normalize chunk: lowercase, collapse whitespace, remove special chars for comparison
            const normalizedChunk = activeChunk.toLowerCase().replace(/\s+/g, ' ').trim();
            const cleanChunk = normalizedChunk.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

            // Strategy 1: Extract short distinctive phrases (less likely to have formatting issues)
            const shortPhrases = [];
            const words = cleanChunk.split(' ').filter(w => w.length > 2);

            // Take 5-word phrases from different parts of the chunk
            if (words.length >= 5) {
                shortPhrases.push(words.slice(0, 5).join(' '));  // First 5 words
                shortPhrases.push(words.slice(-5).join(' '));   // Last 5 words
                const mid = Math.floor(words.length / 2);
                shortPhrases.push(words.slice(mid - 2, mid + 3).join(' ')); // Middle 5 words
            }

            // Strategy 2: Find numbers (very distinctive in financial docs)
            const numbersInChunk = normalizedChunk.match(/\d[\d,\.]+/g) || [];
            const distinctiveNumbers = numbersInChunk.filter(n => n.length >= 3); // Numbers with 3+ digits

            console.log('[PDF_VIEWER] Searching for chunk:', {
                totalPages,
                chunkLength: normalizedChunk.length,
                shortPhrases: shortPhrases.slice(0, 2),
                distinctiveNumbers: distinctiveNumbers.slice(0, 3),
            });

            for (let i = 1; i <= totalPages; i++) {
                try {
                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();

                    // Concatenate all text on this page
                    const pageText = textContent.items
                        .map(item => item.str)
                        .join(' ')
                        .toLowerCase()
                        .replace(/\s+/g, ' ');
                    const cleanPageText = pageText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');

                    // Check Strategy 1: Short phrase matching
                    let phraseMatches = 0;
                    for (const phrase of shortPhrases) {
                        if (cleanPageText.includes(phrase)) {
                            phraseMatches++;
                        }
                    }

                    // Check Strategy 2: Distinctive number matching
                    let numberMatches = 0;
                    for (const num of distinctiveNumbers.slice(0, 5)) {
                        if (pageText.includes(num)) {
                            numberMatches++;
                        }
                    }

                    // Match if 2+ phrases match OR 2+ distinctive numbers match
                    if (phraseMatches >= 2 || (numberMatches >= 2 && phraseMatches >= 1)) {
                        console.log(`[PDF_VIEWER] Found chunk match on page ${i}`, {
                            phraseMatches, numberMatches
                        });
                        setHighlightPage(i);  // ✅ Set which page to highlight
                        listRef.current.scrollToItem(i - 1, 'center');
                        return;
                    }
                } catch (err) {
                    console.error(`Error scanning page ${i} for chunk:`, err);
                }
            }

            // Fallback: Try less strict matching (any single phrase or number match)
            console.log('[PDF_VIEWER] Strict matching failed, trying relaxed matching...');
            for (let i = 1; i <= totalPages; i++) {
                try {
                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase().replace(/\s+/g, ' ');
                    const cleanPageText = pageText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');

                    // Single phrase or number match
                    for (const phrase of shortPhrases) {
                        if (cleanPageText.includes(phrase)) {
                            console.log(`[PDF_VIEWER] Relaxed match on page ${i}:`, phrase);
                            setHighlightPage(i);  // ✅ Set which page to highlight
                            listRef.current.scrollToItem(i - 1, 'center');
                            return;
                        }
                    }
                } catch (err) {
                    // Ignore errors in fallback
                }
            }

            console.log('[PDF_VIEWER] No chunk match found, staying on page 1');
        };

        // Delay to allow pages to render first
        const timeout = setTimeout(findMatchingPage, 500);
        return () => clearTimeout(timeout);
    }, [pdfDoc, activeChunk, totalPages, currentCitationIndex]);

    // Scroll active thumbnail into view
    useEffect(() => {
        const activeThumb = thumbnailRefs.current[currentVisiblePage];
        if (activeThumb && showThumbnails) {
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentVisiblePage, showThumbnails]);

    // ResizeObserver for container-driven list height
    // ⚠️ CRITICAL: This effect MUST run when isOpen changes to re-measure after animation
    useEffect(() => {
        const container = listContainerRef.current;
        if (!container || !isOpen) return;

        const measureHeight = () => {
            // ⚠️ CRITICAL FIX: CSS uses flex:1 to fill remaining space
            // Read clientHeight after CSS flexbox layout has been applied
            const containerHeight = container.clientHeight;
            // Fallback: calculate based on window height minus header(56px) + controls(48px)
            const fallbackHeight = window.innerHeight - 104;

            // Use container height only if it's reasonable (>100px means flex has been applied)
            const finalHeight = containerHeight > 100 ? containerHeight : fallbackHeight;

            console.log('[PDF_VIEWER] Height measurement:', { containerHeight, fallbackHeight, finalHeight });
            setListHeight(finalHeight);
        };

        // ⚠️ CRITICAL: Multiple measurement passes to handle animation timing
        // The framer-motion animation takes ~300ms, so we need to re-measure after it completes
        const timeouts = [];

        // Immediate measurement (might be wrong due to animation)
        measureHeight();

        // Re-measure after animation frames
        const rafId = requestAnimationFrame(() => {
            measureHeight();
        });

        // Re-measure at key animation points
        timeouts.push(setTimeout(measureHeight, 50));   // Early animation
        timeouts.push(setTimeout(measureHeight, 100));  // Mid animation
        timeouts.push(setTimeout(measureHeight, 200));  // Late animation
        timeouts.push(setTimeout(measureHeight, 350));  // Post animation (300ms + buffer)

        // Use ResizeObserver for ongoing resize events
        const resizeObserver = new ResizeObserver(() => {
            measureHeight();
        });

        resizeObserver.observe(container);

        // Also listen to window resize for viewport changes
        const handleWindowResize = () => {
            measureHeight();
        };
        window.addEventListener('resize', handleWindowResize);

        return () => {
            cancelAnimationFrame(rafId);
            timeouts.forEach(t => clearTimeout(t));
            resizeObserver.disconnect();
            window.removeEventListener('resize', handleWindowResize);
        };
    }, [isOpen]);  // ⚠️ CRITICAL: isOpen dependency ensures re-measurement when viewer opens

    // Handle thumbnail click - scroll to page
    const handleThumbnailClick = useCallback((pageNum) => {
        if (listRef.current) {
            listRef.current.scrollToItem(pageNum - 1, 'start');
        }
    }, []);

    // Handle zoom with list reset
    const handleZoomIn = useCallback(() => {
        setScale(s => Math.min(3, s + 0.2));
        // Reset heights to trigger re-render
        setPageHeights(prev => prev.map(() => DEFAULT_PAGE_HEIGHT));
        if (listRef.current) {
            listRef.current.resetAfterIndex(0);
        }
    }, []);

    const handleZoomOut = useCallback(() => {
        setScale(s => Math.max(0.5, s - 0.2));
        // Reset heights to trigger re-render
        setPageHeights(prev => prev.map(() => DEFAULT_PAGE_HEIGHT));
        if (listRef.current) {
            listRef.current.resetAfterIndex(0);
        }
    }, []);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="pdf-viewer-backdrop"
                        onClick={onClose}
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="pdf-viewer-sidebar"
                    >
                        {/* Thumbnails Sidebar - Collapsible */}
                        {showThumbnails && (
                            <div className="pdf-viewer-thumbnails">
                                {thumbnails.map(({ pageNum, dataUrl }) => (
                                    <div
                                        key={pageNum}
                                        ref={(el) => { thumbnailRefs.current[pageNum] = el; }}
                                        className={`thumbnail-item ${currentVisiblePage === pageNum ? 'active' : ''}`}
                                        onClick={() => handleThumbnailClick(pageNum)}
                                    >
                                        <img src={dataUrl} alt={`Page ${pageNum}`} />
                                        <span>{pageNum}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Main Content (Header + Canvas + Controls) */}
                        <div className="pdf-viewer-main">
                            {/* Header */}
                            <div className="pdf-viewer-header">
                                <button
                                    className="thumbnail-toggle-btn"
                                    onClick={() => setShowThumbnails(prev => !prev)}
                                    title={showThumbnails ? 'Hide thumbnails' : 'Show thumbnails'}
                                >
                                    {showThumbnails ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
                                </button>
                                <h3>{filename}</h3>
                                <div className="pdf-viewer-page-indicator">
                                    Page <input
                                        type="number"
                                        min={1}
                                        max={totalPages}
                                        value={currentVisiblePage}
                                        onChange={(e) => {
                                            const page = parseInt(e.target.value, 10);
                                            if (page >= 1 && page <= totalPages && listRef.current) {
                                                listRef.current.scrollToItem(page - 1, 'start');
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const page = parseInt(e.target.value, 10);
                                                if (page >= 1 && page <= totalPages && listRef.current) {
                                                    listRef.current.scrollToItem(page - 1, 'start');
                                                }
                                            }
                                        }}
                                        style={{
                                            width: '50px',
                                            padding: '2px 6px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '4px',
                                            textAlign: 'center',
                                            marginLeft: '4px',
                                            marginRight: '4px'
                                        }}
                                    /> / {totalPages}
                                </div>

                                {/* ✅ Citation Navigation - only show when multiple citations */}
                                {activeCitations.length > 1 && (
                                    <div className="citation-navigation" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginLeft: '16px',
                                        padding: '4px 8px',
                                        background: '#f3f4f6',
                                        borderRadius: '6px',
                                        border: '1px solid #e5e7eb'
                                    }}>
                                        <button
                                            onClick={() => setCurrentCitationIndex(prev => Math.max(0, prev - 1))}
                                            disabled={currentCitationIndex === 0}
                                            style={{
                                                padding: '4px',
                                                border: 'none',
                                                background: currentCitationIndex === 0 ? '#e5e7eb' : '#3b82f6',
                                                color: currentCitationIndex === 0 ? '#9ca3af' : 'white',
                                                borderRadius: '4px',
                                                cursor: currentCitationIndex === 0 ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            title="Previous citation"
                                        >
                                            <ChevronUp size={16} />
                                        </button>
                                        <span style={{
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            color: '#374151',
                                            minWidth: '45px',
                                            textAlign: 'center'
                                        }}>
                                            {currentCitationIndex + 1} of {activeCitations.length}
                                        </span>
                                        <button
                                            onClick={() => setCurrentCitationIndex(prev => Math.min(activeCitations.length - 1, prev + 1))}
                                            disabled={currentCitationIndex === activeCitations.length - 1}
                                            style={{
                                                padding: '4px',
                                                border: 'none',
                                                background: currentCitationIndex === activeCitations.length - 1 ? '#e5e7eb' : '#3b82f6',
                                                color: currentCitationIndex === activeCitations.length - 1 ? '#9ca3af' : 'white',
                                                borderRadius: '4px',
                                                cursor: currentCitationIndex === activeCitations.length - 1 ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            title="Next citation"
                                        >
                                            <ChevronDown size={16} />
                                        </button>
                                    </div>
                                )}

                                <button onClick={onClose}><X /></button>
                            </div>

                            {/* Canvas Container with VariableSizeList */}
                            <div className="pdf-viewer-canvas-container" ref={listContainerRef}>
                                {totalPages > 0 && listHeight > 0 ? (
                                    <VariableSizeList
                                        ref={listRef}
                                        height={listHeight}
                                        width="100%"
                                        itemCount={totalPages}
                                        itemSize={getItemSize}
                                        itemData={itemData}
                                        overscanCount={2}
                                        onScroll={handleScroll}
                                        className="pdf-virtualized-list"
                                    >
                                        {PageRenderer}
                                    </VariableSizeList>
                                ) : (
                                    <div className="pdf-loading-message">Loading PDF...</div>
                                )}
                            </div>

                            {/* Controls - Zoom only (no chevrons) */}
                            <div className="pdf-viewer-controls">
                                <button onClick={handleZoomOut} title="Zoom Out">
                                    <ZoomOut />
                                </button>
                                <span className="zoom-level">{Math.round(scale * 100)}%</span>
                                <button onClick={handleZoomIn} title="Zoom In">
                                    <ZoomIn />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default PDFViewer;
