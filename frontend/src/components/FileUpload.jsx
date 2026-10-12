/**
 * File Upload Component - Drag & Drop File Upload for Data Extraction
 */

import React, { useState, useCallback, useRef } from 'react';
import '../style.css';

const FileUpload = ({ onFilesUploaded, sessionId, isProcessing }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop event
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    }
  }, []);

  // Handle file selection
  const handleChange = useCallback((e) => {
    e.preventDefault();
    setError(null);
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  }, []);

  // Handle files
  const handleFiles = (files) => {
    // Validate file types
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];

    const invalidFiles = files.filter(file => !allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|xlsx|csv)$/i));

    if (invalidFiles.length > 0) {
      setError(`Invalid file type(s): ${invalidFiles.map(f => f.name).join(', ')}. Please upload PDF, DOCX, XLSX, or CSV files.`);
      return;
    }

    setSelectedFiles(files);
  };

  // Upload files
  const uploadFiles = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select files to upload');
      return;
    }

    try {
      setUploadProgress(0);
      await onFilesUploaded(selectedFiles, (progress) => {
        setUploadProgress(progress);
      });

      // Clear selected files after successful upload
      setSelectedFiles([]);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
      setUploadProgress(0);
    }
  };

  // Clear selected files
  const clearFiles = () => {
    setSelectedFiles([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="file-upload-container" style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px', fontWeight: 600 }}>Upload Documents</h3>

      {/* Drag & Drop Zone */}
      <div
        className={`drag-drop-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          border: '2px dashed ' + (dragActive ? '#4A90E2' : '#ddd'),
          borderRadius: '8px',
          padding: '40px',
          textAlign: 'center',
          backgroundColor: dragActive ? '#f0f8ff' : '#fff',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
      >
        <div style={{ fontSize: '48px', marginBottom: '10px' }}>📁</div>
        <p style={{ margin: '10px 0', fontSize: '16px', color: '#666' }}>
          Drag & drop files here or <span style={{ color: '#4A90E2', textDecoration: 'underline' }}>browse</span>
        </p>
        <p style={{ margin: '5px 0', fontSize: '14px', color: '#999' }}>
          Supported: PDF, DOCX, XLSX, CSV
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.csv"
          onChange={handleChange}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>
            Selected Files ({selectedFiles.length})
          </h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '4px' }}>
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                style={{
                  padding: '10px 15px',
                  borderBottom: index < selectedFiles.length - 1 ? '1px solid #eee' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '14px' }}>{file.name}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>{formatFileSize(file.size)}</div>
                </div>
                <div style={{ fontSize: '20px' }}>
                  {file.type.includes('pdf') ? '📄' :
                   file.type.includes('word') ? '📝' :
                   file.type.includes('sheet') || file.name.endsWith('.xlsx') ? '📊' :
                   file.name.endsWith('.csv') ? '📈' : '📄'}
                </div>
              </div>
            ))}
          </div>

          {/* Upload Progress */}
          {uploadProgress > 0 && (
            <div style={{ marginTop: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>Uploading...</span>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{uploadProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    backgroundColor: '#4A90E2',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <button
              onClick={uploadFiles}
              disabled={isProcessing || uploadProgress > 0}
              style={{
                flex: 1,
                padding: '10px 20px',
                backgroundColor: isProcessing || uploadProgress > 0 ? '#ccc' : '#4A90E2',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isProcessing || uploadProgress > 0 ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!isProcessing && uploadProgress === 0) {
                  e.target.style.backgroundColor = '#357ABD';
                }
              }}
              onMouseLeave={(e) => {
                if (!isProcessing && uploadProgress === 0) {
                  e.target.style.backgroundColor = '#4A90E2';
                }
              }}
            >
              {uploadProgress > 0 ? 'Uploading...' : 'Upload Files'}
            </button>
            <button
              onClick={clearFiles}
              disabled={isProcessing || uploadProgress > 0}
              style={{
                padding: '10px 20px',
                backgroundColor: '#fff',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isProcessing || uploadProgress > 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!isProcessing && uploadProgress === 0) {
                  e.target.style.backgroundColor = '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (!isProcessing && uploadProgress === 0) {
                  e.target.style.backgroundColor = '#fff';
                }
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          marginTop: '15px',
          padding: '12px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          color: '#856404',
          fontSize: '14px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Session ID Display */}
      {sessionId && (
        <div style={{ marginTop: '15px', fontSize: '12px', color: '#999' }}>
          Session ID: {sessionId}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
