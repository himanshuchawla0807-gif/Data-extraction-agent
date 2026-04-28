import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSourceViewer } from '../AppContext'; // ✅ NEW: Import context
import { FileText, Globe, ExternalLink } from 'lucide-react';
import CitationPopover from './CitationPopover';
import './CellModal.css';

// Extract citations from content (NEW FORMAT: ||CITE:SOURCE=web|DOMAIN=example.com|URL=https://...||)
const extractCitations = (text) => {
  if (!text) return [];

  const citations = [];

  // NEW FORMAT: ||CITE:SOURCE=web|DOMAIN=example.com|URL=https://...||
  // Use non-greedy match to capture everything (including pipes) between ||CITE: and ||
  const newCiteRegex = /\|\|CITE:(.*?)\|\|/g;
  let match;
  let refNum = 1;

  // console.log('[CITATIONS_REGEX] Testing regex on text:', text);
  // console.log('[CITATIONS_REGEX] Regex pattern:', newCiteRegex);

  while ((match = newCiteRegex.exec(text)) !== null) {
    // console.log('[CITATIONS_REGEX] Match found:', match[0]);
    // console.log('[CITATIONS_REGEX] Captured data:', match[1]);

    const citationData = match[1];
    const parts = {};

    // Parse key=value pairs separated by |
    const pairs = citationData.split('|').filter(pair => pair.trim() && pair.includes('='));
    // console.log('[CITATIONS_PARSE] Pairs:', pairs);

    pairs.forEach(pair => {
      const [key, ...valueParts] = pair.split('=');
      if (key && valueParts.length) {
        const cleanKey = key.trim().toUpperCase();
        const cleanValue = valueParts.join('=').trim();
        parts[cleanKey] = cleanValue;
        // console.log('[CITATIONS_PARSE] Key:', cleanKey, 'Value:', cleanValue);
      }
    });

    // console.log('[CITATIONS_PARSE] Final parts:', parts);

    const source = (parts.SOURCE || parts.source || 'file').toLowerCase();
    const domain = parts.DOMAIN || parts.domain || parts.FILENAME || parts.filename || 'Document';
    const url = parts.URL || parts.url || null;
    const filename = parts.FILENAME || parts.filename || null;
    const excerpt = parts.EXCERPT || parts.excerpt || 'Content referenced from source';

    citations.push({
      number: refNum,
      url,
      fullMatch: match[0],
      source,
      domain,
      filename,
      excerpt
    });
    // console.log('[CITATIONS_PUSH] Added citation #', refNum, ':', citations[citations.length - 1]);
    refNum++;
  }

  // FALLBACK: OLD FORMAT *(Source: URL)* for backwards compatibility
  if (citations.length === 0) {
    const oldSourcePattern = /\*\(Source:\s*(https?:\/\/[^)]+)\)\*/gi;
    const oldMatches = [...text.matchAll(oldSourcePattern)];

    oldMatches.forEach((match, idx) => {
      citations.push({
        number: idx + 1,
        url: match[1],
        fullMatch: match[0],
        source: 'web',
        domain: getDomainFromUrl(match[1]),
        filename: null,
        excerpt: 'Web search result'
      });
    });
  }

  // console.log('[CITATIONS_EXTRACT] Input text:', text);
  // console.log('[CITATIONS_EXTRACT] Found citations:', citations);
  // console.log('[CITATIONS_EXTRACT] Citation count:', citations.length);
  // if (citations.length > 0) {
  //   console.log('[CITATIONS_EXTRACT] First citation:', citations[0]);
  // }

  return citations;
};

// Comment 2: Removed extractReasoning function - relying on structured prop
// Legacy function removed

// Helper functions for citation display
const getDomainFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
};

const getFaviconUrl = (url) => {
  const domain = getDomainFromUrl(url);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
};

// Multi-color badge system - Web (blue) vs Document (gray/green)
const getBadgeColor = (num, isWeb) => {
  // Web sources: Always blue
  if (isWeb) {
    return {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      border: 'border-blue-200',
      hover: 'hover:bg-blue-200'
    };
  }

  // Document sources: Gray (or cycle gray/green if multiple docs)
  const colors = [
    { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', hover: 'hover:bg-gray-200' },
    { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', hover: 'hover:bg-green-200' },
  ];

  const n = typeof num === 'number' ? num : (parseInt(num, 10) || 1);
  const safeNum = isNaN(n) ? 1 : n;
  return colors[(safeNum - 1) % colors.length] || colors[0];
};

// Detect if content is a structured summary JSON
const isStructuredSummary = (text) => {
  if (!text) return false;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' &&
      (parsed.title || parsed.content || parsed.whatsNew ||
        parsed.whatsImportant || parsed.risks || parsed.opportunities);
  } catch {
    return false;
  }
};

const parseStructuredSummary = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// Shared Icon Components
const ReasoningIcon = () => (
  <svg className="section-icon-svg reasoning-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

// Citation Number Component - shows numbered chip with glass popover on hover
const CitationNumber = ({ number, url, source, domain, filename, excerpt, onCitationClick }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'top' });
  const badgeRef = useRef(null);
  const popRef = useRef(null);

  const isWeb = source === 'web' && url;
  const label = isWeb ? (domain || getDomainFromUrl(url) || 'Source') : (filename || 'Document');
  const faviconUrl = url ? getFaviconUrl(url) : null;

  // Normalize number for color resolution
  const safeNumber = Number.parseInt(number, 10) || 1;
  const color = getBadgeColor(safeNumber, isWeb);
  const colorName = color?.bg ? color.bg.split('-')[1] : 'blue';
  const badgeClass = `citation-badge-${colorName}`;

  // Hover opens preview; leaving closes it
  const onEnter = () => setOpen(true);
  const onLeave = () => setOpen(false);

  // Click opens new tab for web, popover for documents
  const onClick = (e) => {
    e.stopPropagation();

    if (isWeb && url) {
      // Web source: Open in new tab directly
      window.open(url, '_blank', 'noopener,noreferrer');
      setOpen(false); // Close hover popover
    } else {
      // Document source: Open CitationPopover modal
      if (onCitationClick) {
        onCitationClick();
      }
    }
  };

  // Smart positioning (top vs bottom; clamps horizontally)
  useEffect(() => {
    if (!open || !badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const M = 12;           // margin
    const CARD_W = 320;     // popover width (keep in sync with CSS)
    const neededH = 150;    // approximate popover height

    const centerX = rect.left + rect.width / 2;
    const placeBottom = (viewportH - rect.bottom) > neededH;
    const placement = placeBottom ? 'bottom' : 'top';
    const top = placement === 'bottom' ? rect.bottom + M : rect.top - M;
    const left = Math.min(Math.max(centerX - CARD_W / 2, M), viewportW - CARD_W - M);
    setPos({ top, left, placement });
  }, [open]);

  // Dismiss on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    const onOutside = (e) => {
      if (badgeRef.current && popRef.current &&
        !badgeRef.current.contains(e.target) &&
        !popRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onEsc);
    document.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  return (
    <>
      <button
        ref={badgeRef}
        className={`citation-num-chip ${badgeClass} ${isWeb ? '' : 'document-source'}`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onClick}
        title="Click to view full context"
      >
        [{number}]
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={popRef}
          className={`citation-popover ${pos.placement}`}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 320, zIndex: 10002 }}
        >
          <div className="popover-arrow" />
          <div className="citation-popover-header" style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt=""
                className="citation-favicon"
                onError={(e) => e.currentTarget.style.display = 'none'}
              />
            ) : (
              isWeb ? <Globe size={14} className="text-gray-400 mr-2" /> : <FileText size={14} className="text-gray-400 mr-2" />
            )}
            <div className="citation-title">
              <div className="source-kind">
                {isWeb ? 'Web Source' : 'From Document'}
              </div>
              <div className="source-name" style={{ fontSize: '12px' }}>{label}</div>
            </div>
          </div>

          <div className="citation-excerpt" style={{ fontSize: '12px', padding: '8px 12px', maxHeight: 'none' }}>
            {excerpt ? (excerpt.length > 120 ? excerpt.slice(0, 120) + '...' : excerpt) : 'No preview available'}
          </div>

          <div style={{ padding: '4px 12px 8px', fontSize: '10px', color: '#9ca3af', textAlign: 'right' }}>
            Click badge [{number}] to view full context
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

const StructuredSummaryView = ({ summary }) => {
  // Comment 1: Normalize list helper
  const normalizeList = (value) => {
    if (Array.isArray(value)) return value;
    if (value) return [String(value)];
    return [];
  };

  const whatsNewItems = normalizeList(summary.whatsNew);
  const whatsImportantItems = normalizeList(summary.whatsImportant);
  const risksItems = normalizeList(summary.risks);
  const opportunitiesItems = normalizeList(summary.opportunities);

  // ✅ PREMIUM SVG ICONS - Replacing emojis for professional finance look
  const TrendUpIcon = () => (
    <svg className="section-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
      <polyline points="17 6 23 6 23 12"></polyline>
    </svg>
  );

  const StarIcon = () => (
    <svg className="section-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  );

  const AlertTriangleIcon = () => (
    <svg className="section-icon-svg warning-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  );

  const TargetIcon = () => (
    <svg className="section-icon-svg opportunity-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  );



  return (
    <div className="structured-summary">
      {summary.title && (
        <h2 className="summary-title">{summary.title}</h2>
      )}

      {summary.content && (
        <div className="summary-content">
          <p>{summary.content}</p>
        </div>
      )}

      {whatsNewItems.length > 0 && (
        <div className="summary-section">
          <h3 className="section-heading">
            <span className="section-icon"><TrendUpIcon /></span>
            What's New
          </h3>
          <ul className="summary-list">
            {whatsNewItems.map((item, idx) => (
              <li key={`new-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {whatsImportantItems.length > 0 && (
        <div className="summary-section">
          <h3 className="section-heading">
            <span className="section-icon"><StarIcon /></span>
            What's Important
          </h3>
          <ul className="summary-list">
            {whatsImportantItems.map((item, idx) => (
              <li key={`important-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {risksItems.length > 0 && (
        <div className="summary-section risk-section">
          <h3 className="section-heading">
            <span className="section-icon"><AlertTriangleIcon /></span>
            Risk Factors
          </h3>
          <ul className="summary-list risk-list">
            {risksItems.map((item, idx) => (
              <li key={`risk-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {opportunitiesItems.length > 0 && (
        <div className="summary-section opportunity-section">
          <h3 className="section-heading">
            <span className="section-icon"><TargetIcon /></span>
            Opportunities
          </h3>
          <ul className="summary-list opportunity-list">
            {opportunitiesItems.map((item, idx) => (
              <li key={`opp-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default function CellModal({ isOpen, onClose, content, columnName, cellRef, onSave, reasoning: propReasoning, citations: propCitations }) {
  const [viewMode, setViewMode] = useState('popover'); // 'popover' or 'full'
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const popoverRef = useRef(null);
  const { openSourceViewer } = useSourceViewer(); // ✅ NEW: Get context function
  const [activeCitation, setActiveCitation] = useState(null);

  const openCitationPopover = (citation) => {
    setActiveCitation(citation);
  };

  // Calculate position relative to viewport (for fixed positioning)
  useEffect(() => {
    if (isOpen && cellRef && cellRef.current && viewMode === 'popover') {
      const cellRect = cellRef.current.getBoundingClientRect();
      setPosition({
        top: cellRect.bottom + 8,  // Fixed positioning uses viewport coordinates
        left: cellRect.left
      });
    }
  }, [isOpen, cellRef, viewMode]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen || viewMode !== 'popover') return;

    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) &&
        cellRef.current && !cellRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, viewMode, onClose, cellRef]);

  // Extract citations from content OR use props
  // Comment 4: Prioritize structured citations prop
  // ✅ FIX: Ensure citations is always an array to prevent forEach errors
  const rawCitations = (propCitations && propCitations.length > 0) ? propCitations : extractCitations(content);
  const citations = Array.isArray(rawCitations) ? rawCitations : [];

  const groupedSources = useMemo(() => {
    const groups = new Map();
    citations.forEach(cit => {
      const fileName = cit.filename || cit.domain || 'Unknown Document';
      if (!groups.has(fileName)) {
        groups.set(fileName, { fileName, citations: [] });
      }
      groups.get(fileName).citations.push(cit);
    });
    return Array.from(groups.values());
  }, [citations]);

  // ✅ FIX: Remove ALL citation markers from display text (nothing inline)
  // Comment 2: Use prop reasoning strictly (fallback removed as markers are gone)
  const reasoning = propReasoning;

  let cleanContent = content || '';
  citations.forEach(cit => {
    // If using structured citations, this regex might not match if content doesn't have them
    // But if content HAS them (legacy string), we strip them.
    if (cit.fullMatch) {
      cleanContent = cleanContent.replace(new RegExp(cit.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
    }
  });

  // Also remove old citation formats if any remain
  cleanContent = cleanContent.replace(/\*\(Source:\s*[^)]+\)\*/gi, '');
  cleanContent = cleanContent.replace(/\|\|CITE:.*?\|\|/gs, '');
  // Comment 2: Removed REASONING regex
  cleanContent = cleanContent.trim();

  // ✅ FIX: Parse JSON content if it's a structured object {"title": "...", "content": "..."}
  try {
    if (cleanContent.startsWith('{') && (cleanContent.includes('"content"') || cleanContent.includes('"title"'))) {
      const parsed = JSON.parse(cleanContent);
      if (parsed && typeof parsed === 'object') {
        // Build formatted content from structured JSON
        const sections = [];

        // Add title as H2 header
        if (parsed.title) {
          sections.push(`## ${parsed.title}`);
        }

        // Add main content
        if (parsed.content) {
          sections.push(parsed.content);
        }

        // Add other sections if present
        if (parsed.whatsNew) {
          sections.push(`### What's New\n${parsed.whatsNew}`);
        }
        if (parsed.whatsImportant) {
          sections.push(`### Key Highlights\n${parsed.whatsImportant}`);
        }
        if (parsed.risks) {
          sections.push(`### Risks\n${parsed.risks}`);
        }
        if (parsed.opportunities) {
          sections.push(`### Opportunities\n${parsed.opportunities}`);
        }
        if (parsed.summary && !parsed.content) {
          sections.push(parsed.summary);
        }

        // Join with double newlines for proper paragraph separation
        cleanContent = sections.join('\n\n');
      }
    }
  } catch (e) {
    // Not valid JSON, keep as is
    console.log('[CellModal] Content is not valid JSON, using as-is');
  }


  // ✅ FIX: Update editValue with clean content (no citations) when editing starts
  useEffect(() => {
    if (isEditing) {
      // Strip markdown headers and formatting for simple value editing
      let simpleValue = cleanContent
        .replace(/^#{1,4}\s*/gm, '')  // Remove markdown headers
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold
        .split('\n')[0]  // Take only first line for simple values
        .trim();
      setEditValue(simpleValue);
    }
  }, [isEditing, cleanContent]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && viewMode === 'full') {
      handleClose();
    }
  };

  const handleClose = () => {
    setViewMode('popover');
    setIsEditing(false);
    setEditValue(content);
    onClose();
  };

  const handleExpand = () => {
    setViewMode('full');
  };

  const handleSave = () => {
    if (onSave) {
      onSave(editValue);
    }
    setIsEditing(false);
    handleClose();
  };

  // ✅ Display title: Show "Cell Preview" instead of cryptic IDs like "_I3bhhn1tg"
  // Real column names have spaces, capital letters, or are longer meaningful words
  const isInternalId = columnName && (
    columnName.startsWith('_') ||
    columnName.startsWith('Column ') ||
    /^[a-z0-9]{8,}$/i.test(columnName) // Looks like a random ID
  );
  const displayTitle = isInternalId ? 'Cell Preview' : (columnName || 'Cell Preview');

  // ✅ FIX: Always use markdown rendering for consistent formatting
  // This ensures **bold**, *italic*, bullets, headers all render properly
  const hasMarkdown = true; // Always use ReactMarkdown for better text handling

  // Check if content is from web search and extract source
  const isWebSearched = content && (content.includes('(Web Searched)') || content.includes('Web Searched'));

  // Try multiple patterns to extract source URL
  let sourceUrl = null;
  if (content) {
    // Pattern 1: (Source: URL)
    let sourceMatch = content.match(/\(Source:\s*(https?:\/\/[^)]+)\)/i);
    if (sourceMatch) {
      sourceUrl = sourceMatch[1];
    } else {
      // Pattern 2: *(Source: URL)*
      sourceMatch = content.match(/\*\(Source:\s*(https?:\/\/[^)]+)\)\*/i);
      if (sourceMatch) {
        sourceUrl = sourceMatch[1];
      } else {
        // Pattern 3: Just find any URL in the content
        sourceMatch = content.match(/(https?:\/\/[^\s)]+)/);
        if (sourceMatch && isWebSearched) {
          sourceUrl = sourceMatch[1];
        }
      }
    }
  }



  // Small preview shows first 250 chars, full shows all
  const smallPreviewLength = 250;
  const isLong = cleanContent && cleanContent.length > smallPreviewLength;
  const displayContent = viewMode === 'popover' && isLong
    ? cleanContent.slice(0, smallPreviewLength) + '...'
    : cleanContent;

  // Popover modal (inline, no backdrop) - Rendered using Portal
  if (viewMode === 'popover') {
    return ReactDOM.createPortal(
      <div
        ref={popoverRef}
        className="cell-popover"
        style={{
          position: 'fixed',  // Changed to fixed for viewport positioning
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: 10000
        }}
      >
        <div className="cell-popover-header">
          <div className="cell-popover-title">
            <svg className="cell-popover-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>{displayTitle}</span>
          </div>
          <div className="cell-popover-actions">
            {isWebSearched && sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cell-citation-link"
                title="View source"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
            )}
            {isLong && (
              <button
                className="cell-popover-expand-btn"
                onClick={handleExpand}
                title="Expand to full view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </button>
            )}
            {/* ✅ NEW: Edit button to edit value from preview */}
            {onSave && (
              <button
                className="cell-popover-expand-btn"
                onClick={() => setIsEditing(true)}
                title="Edit value"
                style={{ marginRight: '4px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            )}
            <button className="cell-popover-close" onClick={handleClose} title="Close">×</button>
          </div>
        </div>
        <div className="cell-popover-body">
          {/* ✅ NEW: Show edit mode or preview mode */}
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.select()}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setIsEditing(false); setEditValue(content); }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            /* ✅ ALWAYS use ReactMarkdown for proper rendering */
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ node, ...props }) => <h1 className="markdown-h1" style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }} {...props} />,
                h2: ({ node, ...props }) => <h2 className="markdown-h2" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '10px' }} {...props} />,
                h3: ({ node, ...props }) => <h3 className="markdown-h3" style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }} {...props} />,
                strong: ({ node, ...props }) => <strong className="markdown-bold" style={{ fontWeight: 700 }} {...props} />,
                p: ({ node, ...props }) => <p className="markdown-paragraph" style={{ marginBottom: '8px', lineHeight: '1.6' }} {...props} />,
                ul: ({ node, ...props }) => <ul className="markdown-list" style={{ paddingLeft: '20px', marginBottom: '8px' }} {...props} />,
                ol: ({ node, ...props }) => <ol className="markdown-list" style={{ paddingLeft: '28px', marginBottom: '8px' }} {...props} />,
                li: ({ node, ...props }) => <li className="markdown-list-item" style={{ marginBottom: '4px' }} {...props} />,
                em: ({ node, ...props }) => <em className="markdown-italic" {...props} />,
              }}
            >
              {displayContent}
            </ReactMarkdown>
          )}

          {/* NEW REASONING SECTION */}
          {reasoning && (
            <>
              <div className="reasoning-section-divider"></div>
              <div className="reasoning-section">
                <div className="reasoning-header">
                  <ReasoningIcon />
                  <span className="reasoning-label">Analysis</span>
                  {/* Expand button to open full-screen reasoning view */}
                  <button
                    className="reasoning-expand-btn"
                    onClick={handleExpand}
                    title="View full analysis"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <polyline points="9 21 3 21 3 15"></polyline>
                      <line x1="21" y1="3" x2="14" y2="10"></line>
                      <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                  </button>
                </div>
                <div className="reasoning-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      strong: ({ node, ...props }) => <strong className="markdown-bold" {...props} />,
                      p: ({ node, ...props }) => <p className="markdown-paragraph" {...props} />,
                      ul: ({ node, ...props }) => <ul className="markdown-list" {...props} />,
                      ol: ({ node, ...props }) => <ol className="markdown-list" style={{ paddingLeft: '28px' }} {...props} />,
                      li: ({ node, ...props }) => <li className="markdown-list-item" {...props} />,
                      em: ({ node, ...props }) => <em className="markdown-italic" {...props} />,
                    }}
                  >
                    {reasoning}
                  </ReactMarkdown>
                </div>
              </div>
            </>
          )}

          {/* NEW CITATION DESIGN: Horizontal divider with vertical line and sources */}
          {citations.length > 0 && (
            <>
              <div className="citation-section-divider" />
              <div className="grouped-sources-section">
                <h4 className="sources-heading">Sources</h4>
                <div className="sources-grid">
                  {groupedSources.map(group => {
                    const isWebGroup = group.citations.some(c => c.source === 'web');
                    // ✅ Extract actual URL for web sources (for favicon and linking)
                    const firstWebCitation = group.citations.find(c => c.source === 'web' && c.url);
                    const webUrl = firstWebCitation?.url || '';
                    // ✅ Extract clean domain for favicon
                    let faviconDomain = '';
                    try {
                      if (webUrl && !webUrl.includes('vertexaisearch')) {
                        faviconDomain = new URL(webUrl).hostname;
                      } else if (group.citations[0]?.domain && !group.citations[0]?.domain.includes('vertexai')) {
                        faviconDomain = group.citations[0].domain;
                      }
                    } catch (e) { /* ignore */ }

                    return (
                      <div key={group.fileName} className="source-group-card">
                        <div
                          className="source-group-header"
                          style={isWebGroup && webUrl ? { cursor: 'pointer' } : {}}
                          onClick={isWebGroup && webUrl && !webUrl.includes('vertexaisearch') ? () => window.open(webUrl, '_blank') : undefined}
                        >
                          {/* ✅ IMPROVED: Use Google Favicon API for web sources */}
                          {isWebGroup ? (
                            faviconDomain ? (
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=32`}
                                alt={faviconDomain}
                                style={{ width: 20, height: 20, borderRadius: 4 }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <Globe className="source-icon" />
                            )
                          ) : (
                            <FileText className="source-icon" />
                          )}
                          <div className="source-info">
                            {/* ✅ IMPROVED: Show clean domain name for web sources, not Vertex AI URL */}
                            <div className="source-filename">
                              {isWebGroup
                                ? (faviconDomain || group.fileName.replace('vertexaisearch.cloud.google.com', 'Web Source'))
                                : group.fileName}
                            </div>
                            <div className="source-count">{group.citations.length} citation(s)</div>
                          </div>
                          {/* ✅ DIRECT OPEN BUTTON - Outside AnimatePresence, clicks work reliably */}
                          {!isWebGroup && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                console.log('[CellModal] Open clicked:', group.fileName, 'citations:', group.citations.length);
                                const firstCitation = group.citations[0];
                                openSourceViewer({
                                  filename: firstCitation?.filename || group.fileName,
                                  text: firstCitation?.excerpt || '',
                                  field: columnName,
                                  citations: group.citations // ✅ Pass ALL citations for navigation
                                }, cleanContent);
                                // Close the modal after opening PDF
                                if (handleClose) handleClose();
                              }}
                              style={{
                                marginLeft: 'auto',
                                padding: '6px 10px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Open PDF in viewer"
                            >
                              <ExternalLink size={12} />
                              Open
                            </button>
                          )}
                          {/* ✅ NEW: Open button for web sources */}
                          {isWebGroup && webUrl && !webUrl.includes('vertexaisearch') && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(webUrl, '_blank');
                              }}
                              style={{
                                marginLeft: 'auto',
                                padding: '6px 10px',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Open website"
                            >
                              <ExternalLink size={12} />
                              Visit
                            </button>
                          )}
                        </div>
                        <div className="source-citations">
                          {group.citations.map(cit => (
                            <CitationNumber
                              key={cit.number}
                              {...cit}
                              onCitationClick={() => openCitationPopover(cit)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div >

        {/* ✅ FIX: Render CitationPopover in popover mode too */}
        <CitationPopover
          citation={activeCitation}
          isOpen={!!activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      </div >,
      document.body  // Render outside table hierarchy
    );
  }

  // Full modal (centered with backdrop) - Also rendered using Portal
  return ReactDOM.createPortal(
    <div className="cell-modal-backdrop" onClick={handleBackdropClick}>
      <div className="cell-modal cell-modal-full">
        <div className="cell-modal-header">
          <div className="cell-modal-title">
            <svg className="cell-modal-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <h3>{displayTitle}</h3>
          </div>
          <div className="cell-modal-header-actions">
            {isWebSearched && sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cell-citation-btn"
                title="View source"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                Source
              </a>
            )}
            {!isEditing && (
              <button
                className="cell-modal-edit-btn"
                onClick={() => setIsEditing(true)}
                title="Edit content"
              >
                Edit
              </button>
            )}
            {isEditing && (
              <button
                className="cell-modal-save-btn"
                onClick={handleSave}
                title="Save changes"
              >
                Save
              </button>
            )}
            <button className="cell-modal-close" onClick={handleClose} title="Close">
              ×
            </button>
          </div>
        </div>
        <div className="cell-modal-body full">
          {isEditing ? (
            <textarea
              className="cell-modal-textarea"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            />
          ) : (
            <div className="cell-modal-content">
              {/* ✅ ALWAYS use ReactMarkdown for proper rendering */}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ node, ...props }) => <h1 className="markdown-h1" style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }} {...props} />,
                  h2: ({ node, ...props }) => <h2 className="markdown-h2" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '10px' }} {...props} />,
                  h3: ({ node, ...props }) => <h3 className="markdown-h3" style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }} {...props} />,
                  strong: ({ node, ...props }) => <strong className="markdown-bold" style={{ fontWeight: 700 }} {...props} />,
                  p: ({ node, ...props }) => <p className="markdown-paragraph" style={{ marginBottom: '8px', lineHeight: '1.6' }} {...props} />,
                  ul: ({ node, ...props }) => <ul className="markdown-list" style={{ paddingLeft: '20px', marginBottom: '8px' }} {...props} />,
                  ol: ({ node, ...props }) => <ol className="markdown-list" style={{ paddingLeft: '28px', marginBottom: '8px' }} {...props} />,
                  li: ({ node, ...props }) => <li className="markdown-list-item" style={{ marginBottom: '4px' }} {...props} />,
                  em: ({ node, ...props }) => <em className="markdown-italic" {...props} />,
                }}
              >
                {cleanContent}
              </ReactMarkdown>

              {/* NEW REASONING SECTION */}
              {reasoning && (
                <>
                  <div className="reasoning-section-divider"></div>
                  <div className="reasoning-section">
                    <div className="reasoning-header">
                      <ReasoningIcon />
                      <span className="reasoning-label">Analysis</span>
                    </div>
                    <div className="reasoning-text">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          strong: ({ node, ...props }) => <strong className="markdown-bold" {...props} />,
                          p: ({ node, ...props }) => <p className="markdown-paragraph" {...props} />,
                          ul: ({ node, ...props }) => <ul className="markdown-list" {...props} />,
                          ol: ({ node, ...props }) => <ol className="markdown-list" style={{ paddingLeft: '28px' }} {...props} />,
                          li: ({ node, ...props }) => <li className="markdown-list-item" {...props} />,
                          em: ({ node, ...props }) => <em className="markdown-italic" {...props} />,
                        }}
                      >
                        {reasoning}
                      </ReactMarkdown>
                    </div>
                  </div>
                </>
              )}

              {/* NEW CITATION DESIGN: Horizontal divider with vertical line and sources */}
              {citations.length > 0 && (
                <>
                  <div className="citation-section-divider" />
                  <div className="grouped-sources-section">
                    <h4 className="sources-heading">Sources</h4>
                    <div className="sources-grid">
                      {groupedSources.map(group => {
                        const isWebGroup = group.citations.some(c => c.source === 'web');
                        // ✅ Extract actual URL for web sources (for favicon and linking)
                        const firstWebCitation = group.citations.find(c => c.source === 'web' && c.url);
                        const webUrl = firstWebCitation?.url || '';
                        // ✅ Extract clean domain for favicon
                        let faviconDomain = '';
                        try {
                          if (webUrl && !webUrl.includes('vertexaisearch')) {
                            faviconDomain = new URL(webUrl).hostname;
                          } else if (group.citations[0]?.domain && !group.citations[0]?.domain.includes('vertexai')) {
                            faviconDomain = group.citations[0].domain;
                          }
                        } catch (e) { /* ignore */ }

                        return (
                          <div key={group.fileName} className="source-group-card">
                            <div
                              className="source-group-header"
                              style={isWebGroup && webUrl ? { cursor: 'pointer' } : {}}
                              onClick={isWebGroup && webUrl && !webUrl.includes('vertexaisearch') ? () => window.open(webUrl, '_blank') : undefined}
                            >
                              {/* ✅ IMPROVED: Use Google Favicon API for web sources */}
                              {isWebGroup ? (
                                faviconDomain ? (
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=32`}
                                    alt={faviconDomain}
                                    style={{ width: 20, height: 20, borderRadius: 4 }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : (
                                  <Globe className="source-icon" />
                                )
                              ) : (
                                <FileText className="source-icon" />
                              )}
                              <div className="source-info">
                                {/* ✅ IMPROVED: Show clean domain name for web sources */}
                                <div className="source-filename">
                                  {isWebGroup
                                    ? (faviconDomain || group.fileName.replace('vertexaisearch.cloud.google.com', 'Web Source'))
                                    : group.fileName}
                                </div>
                                <div className="source-count">{group.citations.length} citation(s)</div>
                              </div>
                              {/* ✅ DIRECT OPEN BUTTON - Full Modal Version */}
                              {!isWebGroup && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    console.log('[CellModal Full] Open clicked:', group.fileName, 'citations:', group.citations.length);
                                    const firstCitation = group.citations[0];
                                    openSourceViewer({
                                      filename: firstCitation?.filename || group.fileName,
                                      text: firstCitation?.excerpt || '',
                                      field: columnName,
                                      citations: group.citations // ✅ Pass ALL citations for navigation
                                    }, cleanContent);
                                    // Close the modal after opening PDF
                                    if (handleClose) handleClose();
                                  }}
                                  style={{
                                    marginLeft: 'auto',
                                    padding: '6px 10px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Open PDF in viewer"
                                >
                                  <ExternalLink size={12} />
                                  Open
                                </button>
                              )}
                              {/* ✅ NEW: Open button for web sources */}
                              {isWebGroup && webUrl && !webUrl.includes('vertexaisearch') && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(webUrl, '_blank');
                                  }}
                                  style={{
                                    marginLeft: 'auto',
                                    padding: '6px 10px',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Open website"
                                >
                                  <ExternalLink size={12} />
                                  Visit
                                </button>
                              )}
                            </div>
                            <div className="source-citations">
                              {group.citations.map(cit => (
                                <CitationNumber
                                  key={cit.number}
                                  {...cit}
                                  onCitationClick={() => openCitationPopover(cit)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="cell-modal-footer">
          <div className="cell-modal-stats">
            <span>{content ? content.split(/\s+/).length : 0} words</span>
            <span>•</span>
            <span>{content ? content.length : 0} characters</span>
          </div>
        </div>
      </div >

      <CitationPopover
        citation={activeCitation}
        isOpen={!!activeCitation}
        onClose={() => setActiveCitation(null)}
      />
    </div >,
    document.body  // Render outside table hierarchy
  );
}
