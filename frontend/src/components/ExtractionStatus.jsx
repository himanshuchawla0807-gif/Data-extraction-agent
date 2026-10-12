/**
 * Extraction Status Component - Real-time Extraction Progress Display
 */

import React from 'react';
import '../style.css';

const ExtractionStatus = ({ status, files, fields, results }) => {
  // Calculate overall progress
  const calculateProgress = () => {
    if (!files || files.length === 0) return 0;

    const completedFiles = files.filter(f => f.status === 'complete').length;
    return Math.round((completedFiles / files.length) * 100);
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'indexing':
        return '#FFA500';
      case 'extracting':
        return '#4A90E2';
      case 'verified':
        return '#5CB85C';
      case 'complete':
        return '#5CB85C';
      case 'error':
        return '#D9534F';
      default:
        return '#999';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'indexing':
        return '📑';
      case 'extracting':
        return '🔍';
      case 'verified':
        return '✅';
      case 'complete':
        return '✅';
      case 'error':
        return '❌';
      case 'queued':
        return '⏳';
      default:
        return '📄';
    }
  };

  if (!status || status === 'idle') {
    return null;
  }

  return (
    <div className="extraction-status-container" style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Extraction Status</h3>
        <div style={{
          padding: '5px 15px',
          backgroundColor: getStatusColor(status),
          color: '#fff',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: 600
        }}>
          {status.toUpperCase()}
        </div>
      </div>

      {/* Overall Progress */}
      {files && files.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>
              Overall Progress: {files.filter(f => f.status === 'complete').length} / {files.length} files
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{calculateProgress()}%</span>
          </div>
          <div style={{ width: '100%', height: '10px', backgroundColor: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${calculateProgress()}%`,
                height: '100%',
                backgroundColor: '#4A90E2',
                transition: 'width 0.5s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {calculateProgress() > 0 && calculateProgress() < 100 && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  animation: 'shimmer 2s infinite'
                }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fields Being Extracted */}
      {fields && fields.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
            Fields to Extract ({fields.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {fields.map((field, index) => (
              <div
                key={index}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                {field}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files Progress */}
      {files && files.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Files Processing</h4>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {files.map((file, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <div style={{ fontSize: '24px' }}>
                  {getStatusIcon(file.status)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>
                    {file.filename || file.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Status: <span style={{ color: getStatusColor(file.status), fontWeight: 600 }}>
                      {file.status}
                    </span>
                    {file.progress !== undefined && file.progress < 100 && (
                      <span> - {Math.round(file.progress)}%</span>
                    )}
                  </div>
                  {file.error && (
                    <div style={{ fontSize: '12px', color: '#D9534F', marginTop: '4px' }}>
                      Error: {file.error}
                    </div>
                  )}
                </div>
                {file.progress !== undefined && (
                  <div style={{ width: '60px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right' }}>
                      {Math.round(file.progress)}%
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extraction Results Summary */}
      {results && Object.keys(results).length > 0 && (
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
            Extraction Results
          </h4>
          <div style={{
            padding: '15px',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Total Fields</div>
              <div style={{ fontSize: '20px', fontWeight: 600 }}>{results.total_fields || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Extracted</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#5CB85C' }}>{results.success_count || 0}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Success Rate</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#4A90E2' }}>
                {results.success_rate ? `${Math.round(results.success_rate * 100)}%` : '0%'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation */}
      <style>
        {`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}
      </style>
    </div>
  );
};

export default ExtractionStatus;
