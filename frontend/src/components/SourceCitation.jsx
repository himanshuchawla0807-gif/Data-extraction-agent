import React, { useState } from 'react';
import './SourceCitation.css';

const SourceCitation = ({ refNum, source, domain, url, filename }) => {
  const [showPreview, setShowPreview] = useState(false);
  
  // Determine source label
  const sourceLabel = source === 'file' 
    ? `Source: ${filename || 'Document'}` 
    : 'Source: Web Search';
  
  // Get favicon URL (using Google's favicon service)
  const faviconUrl = url 
    ? `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`
    : null;
  
  // Truncate URL for preview
  const truncateUrl = (url, maxLength = 60) => {
    if (!url) return '';
    return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
  };
  
  const handleClick = (e) => {
    e.stopPropagation(); // Prevent cell click
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <div 
      className="citation-wrapper"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      {/* Inline reference number */}
      <span 
        className={`citation-ref ${url ? 'clickable' : ''}`}
        onClick={handleClick}
        title={sourceLabel}
      >
        [{refNum}]
      </span>
      
      {/* Rich hover preview */}
      {showPreview && (
        <div className="citation-preview">
          <div className="citation-preview-header">
            {faviconUrl && (
              <img 
                src={faviconUrl} 
                alt="" 
                className="citation-favicon"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className="citation-preview-title">
              <div className="citation-source-label">{sourceLabel}</div>
              <div className="citation-domain">{domain}</div>
            </div>
          </div>
          
          {url && (
            <div className="citation-preview-url">
              {truncateUrl(url)}
            </div>
          )}
          
          {url && (
            <div className="citation-preview-action">
              Click to open →
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SourceCitation;
