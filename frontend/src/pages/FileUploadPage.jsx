/**
 * FileUploadPage - Premium Apple-Style UI
 * Inspired by Due Diligence Agent design
 * Clean, minimalistic interface with smooth animations
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../style.css';

const FileUploadPage = ({ onFilesProcessed, sessionId, processingStatus = 'idle', onViewData }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [internalUploadStatus, setInternalUploadStatus] = useState('idle');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Allow parent to control status
  const uploadStatus = processingStatus !== 'idle' ? processingStatus : internalUploadStatus;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (files) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];

    const validFiles = files.filter(file =>
      allowedTypes.includes(file.type) || file.name.match(/\.(pdf|docx|xlsx|csv)$/i)
    );

    if (validFiles.length !== files.length) {
      setError('Some files were rejected. Only PDF, DOCX, XLSX, and CSV files are allowed.');
    } else {
      setError(null);
    }

    setSelectedFiles(validFiles);

    if (validFiles.length > 0) {
      handleUpload(validFiles);
    }
  };

  const handleUpload = async (filesToUpload) => {
    try {
      setInternalUploadStatus('uploading');
      setError(null);

      await onFilesProcessed(filesToUpload, {
        onUploadProgress: () => { },
        onIndexingProgress: () => { },
        onComplete: () => {
          if (processingStatus === 'idle') {
            setInternalUploadStatus('complete');
          }
        }
      });
    } catch (err) {
      console.error('Upload error:', err);
      setError(`Upload failed: ${err.message || 'Unknown error'}`);
      setInternalUploadStatus('error');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Upload Icon SVG
  const UploadIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  // File Icon SVG
  const FileIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );

  // Check Icon SVG
  const CheckIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      backgroundColor: '#F5F5F7',
      color: '#1D1D1F',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px'
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: '900px' }}
      >
        {/* Header Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          style={{
            textAlign: 'center',
            marginBottom: '32px'
          }}
        >
          <span style={{
            display: 'inline-block',
            padding: '6px 16px',
            borderRadius: '9999px',
            backgroundColor: 'white',
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            fontSize: '14px',
            fontWeight: '500',
            color: '#6B7280'
          }}>
            Data Extraction Agent
          </span>
        </motion.div>

        {/* Main Upload Zone */}
        <motion.div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => uploadStatus === 'idle' && fileInputRef.current?.click()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          style={{
            position: 'relative',
            backgroundColor: 'white',
            borderRadius: '40px',
            border: `2px solid ${dragActive ? '#374151' : '#E5E7EB'}`,
            cursor: uploadStatus === 'idle' ? 'pointer' : 'default',
            transition: 'all 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: dragActive
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.15)'
              : '0 10px 40px -10px rgba(0, 0, 0, 0.08)',
            transform: dragActive ? 'scale(1.02)' : 'scale(1)',
            overflow: 'hidden'
          }}
        >
          <AnimatePresence mode="wait">
            {/* Idle State */}
            {uploadStatus === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                style={{
                  padding: '80px 32px',
                  textAlign: 'center'
                }}
              >
                {/* Upload Icon with Animation */}
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 3 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    width: '96px',
                    height: '96px',
                    margin: '0 auto 32px',
                    borderRadius: '24px',
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#111827'
                  }}
                >
                  <UploadIcon />
                </motion.div>

                <h2 style={{
                  fontSize: '36px',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '16px',
                  letterSpacing: '-0.5px'
                }}>
                  Upload Documents
                </h2>

                <p style={{
                  fontSize: '18px',
                  color: '#6B7280',
                  maxWidth: '400px',
                  margin: '0 auto 40px',
                  fontWeight: '300',
                  lineHeight: '1.6'
                }}>
                  Drag and drop your files here, or click to browse.<br />
                  We support PDF, Excel, and Word documents.
                </p>

                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    padding: '16px 40px',
                    backgroundColor: '#000',
                    color: 'white',
                    border: 'none',
                    borderRadius: '9999px',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                    transition: 'all 0.2s'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Choose Files
                </motion.button>
              </motion.div>
            )}

            {/* Uploading State */}
            {uploadStatus === 'uploading' && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                style={{
                  padding: '80px 32px',
                  textAlign: 'center',
                  minHeight: '450px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {/* Icon with subtle float animation */}
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    width: '96px',
                    height: '96px',
                    marginBottom: '32px',
                    borderRadius: '24px',
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#111827'
                  }}
                >
                  <UploadIcon />
                </motion.div>

                <h2 style={{
                  fontSize: '36px',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '16px',
                  letterSpacing: '-0.5px'
                }}>
                  Uploading files...
                </h2>
                <p style={{
                  fontSize: '18px',
                  color: '#6B7280',
                  fontWeight: '300',
                  marginBottom: '32px'
                }}>
                  Please wait while we upload your documents
                </p>

                <span style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '9999px',
                  fontSize: '14px',
                  color: '#64748B',
                  fontWeight: '400'
                }}>
                  This usually takes a few seconds.
                </span>
              </motion.div>
            )}

            {/* Processing State */}
            {uploadStatus === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  padding: '80px 32px',
                  textAlign: 'center',
                  minHeight: '450px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {/* Icon with subtle pulse - matches upload page style */}
                <motion.div
                  animate={{
                    scale: [1, 1.05, 1],
                    opacity: [1, 0.8, 1]
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    width: '96px',
                    height: '96px',
                    margin: '0 auto 32px',
                    borderRadius: '24px',
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#111827'
                  }}
                >
                  <FileIcon />
                </motion.div>

                <h2 style={{
                  fontSize: '36px',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '16px',
                  letterSpacing: '-0.5px'
                }}>
                  Processing Documents
                </h2>

                <p style={{
                  fontSize: '18px',
                  color: '#6B7280',
                  maxWidth: '400px',
                  margin: '0 auto 32px',
                  fontWeight: '300',
                  lineHeight: '1.6'
                }}>
                  Analyzing structure and preparing data extraction...
                </p>

                <span style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '9999px',
                  fontSize: '14px',
                  color: '#64748B',
                  fontWeight: '400'
                }}>
                  For large files, this can take 3 to 5 minutes.
                </span>
              </motion.div>
            )}

            {/* Complete State */}
            {uploadStatus === 'complete' && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  padding: '80px 32px',
                  textAlign: 'center',
                  minHeight: '450px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  style={{
                    width: '96px',
                    height: '96px',
                    margin: '0 auto 32px',
                    borderRadius: '24px',
                    backgroundColor: '#DCFCE7',
                    border: '1px solid #BBF7D0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#16A34A'
                  }}
                >
                  <CheckIcon />
                </motion.div>

                <h2 style={{
                  fontSize: '36px',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '16px',
                  letterSpacing: '-0.5px'
                }}>
                  Upload complete!
                </h2>
                <p style={{
                  fontSize: '18px',
                  color: '#6B7280',
                  fontWeight: '300'
                }}>
                  Your documents are ready for extraction
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '12px 24px',
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  borderRadius: '12px',
                  color: '#92400E',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.csv"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </motion.div>

        {/* Selected Files List */}
        <AnimatePresence>
          {selectedFiles.length > 0 && uploadStatus === 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.2 }}
              style={{ marginTop: '40px' }}
            >
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '16px',
                paddingLeft: '8px'
              }}>
                Selected Files
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedFiles.map((file, index) => (
                  <motion.div
                    key={file.name + index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      backgroundColor: 'white',
                      borderRadius: '16px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        backgroundColor: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#6B7280'
                      }}>
                        <FileIcon />
                      </div>
                      <div>
                        <p style={{
                          fontSize: '16px',
                          fontWeight: '500',
                          color: '#111827',
                          marginBottom: '4px'
                        }}>
                          {file.name}
                        </p>
                        <span style={{
                          fontSize: '13px',
                          color: '#9CA3AF'
                        }}>
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#10B981',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <CheckIcon /> Ready
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default FileUploadPage;
