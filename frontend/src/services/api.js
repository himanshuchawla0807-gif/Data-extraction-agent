/**
 * API Service - HTTP Client for Data Extraction Backend
 * Handles file uploads, session management, and HTTP requests
 */

import axios from 'axios';
import { API_BASE_URL } from '../config';
import { getLocalIdentity } from './localIdentity';

// API Configuration
// const API_BASE_URL = 'http://localhost:8001/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes (300 seconds) for processing
  headers: {
    // 'Content-Type': 'application/json', // Let axios set this for multipart
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('[API] Authorization header set from auth_token');
    } else {
      const localIdentity = getLocalIdentity();
      config.headers['X-Local-Mode'] = 'true';
      config.headers['X-Local-User'] = localIdentity.userId;
      console.info(`[API] Local mode active for ${localIdentity.userId}`);
    }

    console.log('ðŸ“¤ [API] Request:', config.method.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('Response error:', error.response || error);

    // Handle specific error cases
    if (error.response) {
      switch (error.response.status) {
        case 401:
          console.error('Unauthorized - Please log in');
          break;
        case 403:
          console.error('Forbidden - Access denied');
          break;
        case 404:
          console.error('Not found');
          break;
        case 500:
          console.error('Server error');
          break;
        default:
          console.error(`Error ${error.response.status}: ${error.response.statusText}`);
      }
    } else if (error.request) {
      console.error('No response received from server');
    } else {
      console.error('Error setting up request:', error.message);
    }

    return Promise.reject(error);
  }
);

/**
 * API Service Class
 */
class ApiService {
  /**
   * Check service health
   */
  async checkHealth() {
    try {
      console.log(`[API] Checking health at ${apiClient.defaults.baseURL}/health`);
      const response = await apiClient.get('/health');
      console.log('[API] Health check passed:', response.status, response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Health check failed:', error.message);
      throw error;
    }
  }

  /**
   * Get service information
   */
  async getServiceInfo() {
    try {
      const response = await apiClient.get('/');
      return response.data;
    } catch (error) {
      console.error('Failed to get service info:', error);
      throw error;
    }
  }

  /**
   * Upload files
   * @param {string} sessionId - Session identifier
   * @param {File[]} files - Array of File objects
   * @param {function} onProgress - Progress callback
   */
  async uploadFiles(sessionId, files, onProgress = null) {
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);

      // Add all files to form data
      files.forEach((file) => {
        formData.append('files', file);
      });

      // âœ… CORRECT: Use the data-extraction upload endpoint
      const response = await apiClient.post('/data-extraction/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
      });

      console.log('[API] Upload response:', response.data);
      return response.data;
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }

  /**
   * Extract data
   * @param {string} documentId - Document ID
   * @param {string[]} fields - Fields to extract
   * @param {object} schema - Optional extraction schema
   */
  async extractData(documentId, fields, schema = null) {
    try {
      // This might need adjustment if the frontend calls this separately
      // For now, mapping to /extract but it might be redundant if uploadFiles does it all
      const response = await apiClient.post('/extract', {
        document_id: documentId,
        fields,
        schema,
      });
      return response.data;
    } catch (error) {
      console.error('Data extraction failed:', error);
      throw error;
    }
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save session ID to storage
   */
  saveSessionId(sessionId) {
    localStorage.setItem('data_extraction_session_id', sessionId);
    localStorage.setItem('data_extraction_last_session_id', sessionId);
  }

  /**
   * Set session ID (alias for saveSessionId - used by session restore)
   */
  setSessionId(sessionId) {
    this.saveSessionId(sessionId);
  }

  /**
   * Get session ID from storage
   */
  getSessionId() {
    return localStorage.getItem('data_extraction_session_id');
  }

  /**
   * Create new session
   */
  createSession() {
    const sessionId = this.generateSessionId();
    this.saveSessionId(sessionId);
    return sessionId;
  }

  /**
   * Get or create session
   */
  getOrCreateSession() {
    let sessionId = this.getSessionId();
    if (!sessionId) {
      sessionId = this.createSession();
    }
    return sessionId;
  }

  /**
   * Clear session
   */
  clearSession() {
    localStorage.removeItem('data_extraction_session_id');
  }

  /**
   * Check backend health
   */
  async checkDataExtractionHealth() {
    try {
      const response = await apiClient.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  /**
   * Get files for a specific session
   * @param {string} sessionId - Session identifier
   */
  async getSessionFiles(sessionId) {
    try {
      const response = await apiClient.get(`/data-extraction/session/${sessionId}/files`);
      return response.data;
    } catch (error) {
      console.error('Failed to get session files:', error);
      return { success: false, files: [], error: error.message };
    }
  }
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;
