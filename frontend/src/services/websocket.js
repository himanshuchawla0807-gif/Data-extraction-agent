/**
 * WebSocket Service - Real-time Communication with Data Extraction Backend
 * Handles bidirectional WebSocket communication for file uploads and extraction progress
 */

import { getWsUrl } from '../config';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.listeners = new Map();
    this.isConnecting = false;
    // ✅ NEW: Global web search toggle state - included in ALL messages
    this.webSearchEnabled = true;  // Default: enabled
  }

  /**
   * Set web search enabled state - call this when toggle changes
   * @param {boolean} enabled - Whether web search is enabled
   */
  setWebSearchEnabled(enabled) {
    this.webSearchEnabled = enabled;
    console.log(`[WS_SERVICE] 🔍 Web search toggle set to: ${enabled}`);
  }

  /**
   * Connect to WebSocket server
   * @param {string} sessionId - Unique session identifier
   * @param {string} url - WebSocket server URL (default: localhost:8001)
   * @param {string} userId - Optional user ID for Firestore message persistence
   */
  connect(sessionId, url = getWsUrl(), userId = null, token = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return Promise.resolve();
    }

    if (this.isConnecting) {
      console.log('Connection already in progress');
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.sessionId = sessionId;
    this.userId = userId;  // ✅ Store for reconnection
    // ✅ NEW: Include user ID and Token in WebSocket URL for message persistence & security
    let wsUrl = `${url}/${sessionId}`;
    const params = new URLSearchParams();
    if (userId) params.append('user', userId);
    if (token) params.append('token', token);

    const queryString = params.toString();
    if (queryString) {
      wsUrl += `?${queryString}`;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to WebSocket: ${wsUrl}`);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected successfully');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          this.emit('connected', { sessionId: this.sessionId });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.isConnecting = false;
          this.emit('disconnected', { code: event.code, reason: event.reason });

          // Attempt to reconnect if not explicitly closed
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.sessionId = null;
      this.reconnectAttempts = 0;
    }
  }

  /**
   * Reconnect to WebSocket server
   */
  reconnect() {
    this.reconnectAttempts++;

    // [COMMENT 4] Explicit 1s, 2s, 5s backoff strategy
    // Intervals: 1000ms, 2000ms, 5000ms. Subsequent attempts cap at 5000ms.
    const backoffIntervals = [1000, 2000, 5000];
    const delay = backoffIntervals[Math.min(this.reconnectAttempts - 1, backoffIntervals.length - 1)];

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (this.sessionId) {
        // Note: Reconnection might fail if token is expired/missing in stored state
        // Ideal fix: Store token in class instance, but for now we rely on the caller to handle fresh tokens
        this.connect(this.sessionId, getWsUrl(), this.userId).catch(console.error);
      }
    }, delay);
  }

  /**
   * Send message to server
   * @param {object} message - Message object to send
   */
  send(message) {
    console.log('[WS_SERVICE] send() called with:', message.type);

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WS_SERVICE] WebSocket is not connected! readyState:', this.ws?.readyState);
      return false;
    }

    try {
      // ✅ CRITICAL: Always include enable_web_search in messages
      // Only add to messages that go to processing (not ping, get_status, etc)
      const processingTypes = ['extraction_query', 'start_extraction', 'chat_message', 'column_query', 'refine_column'];
      const messageWithWebSearch = processingTypes.includes(message.type)
        ? { ...message, enable_web_search: message.enable_web_search !== undefined ? message.enable_web_search : this.webSearchEnabled }
        : message;

      const jsonMessage = JSON.stringify(messageWithWebSearch);
      console.log('[WS_SERVICE] Sending:', jsonMessage.substring(0, 300));
      console.log('[WS_SERVICE] 🔍 enable_web_search in this message:', messageWithWebSearch.enable_web_search);
      this.ws.send(jsonMessage);
      console.log('[WS_SERVICE] Message sent successfully!');
      return true;
    } catch (error) {
      console.error('[WS_SERVICE] Failed to send WebSocket message:', error);
      return false;
    }
  }

  /**
   * Handle incoming messages
   * @param {object} message - Parsed message object
   */
  handleMessage(message) {
    const { type } = message;

    switch (type) {
      case 'welcome':
      case 'connection_established':
        this.emit('welcome', message);
        break;

      case 'upload_complete':
        this.emit('uploadComplete', message);
        this.emit('upload_complete', message);
        break;

      case 'indexing_complete':
        this.emit('indexingComplete', message);
        break;

      case 'extraction_progress':
        this.emit('extractionProgress', message);
        break;

      case 'extraction_result':
        this.emit('extractionResult', message);
        break;

      case 'extraction_complete':
        this.emit('extractionComplete', message);
        this.emit('extraction_complete', message);
        break;

      case 'status_update':
        this.emit('statusUpdate', message);
        break;

      case 'error':
        this.emit('error', message);
        break;

      case 'pong':
        this.emit('pong', message);
        break;

      case 'chat_response':
        this.emit('chat_response', message);
        break;

      case 'chat_chunk':
        this.emit('chat_chunk', message);
        break;

      case 'file_card':
        this.emit('file_card', message);
        break;

      case 'modification_preview':
        this.emit('modification_preview', message);
        break;

      case 'extraction_query_response':
        this.emit('extraction_query_response', message);
        break;

      case 'create_column':
        this.emit('create_column', message);
        break;

      case 'streamRowData':
      case 'stream_row_data': // Legacy fallback
        // ✅ DEBUG: Log every streamRowData received at WS service level
        console.log('[WS_SERVICE] 📥 streamRowData received:', message.data?.column_name || message.column_name, '| file:', message.data?.file_name || message.file_name);
        // Emit full message as handleStreamRowData expects 'data.data' wrapper
        this.emit('streamRowData', message);
        break;



      case 'debug':
        console.log('[DEBUG FROM BACKEND]', message.message);
        this.emit('debug', message);
        break;

      case 'process_step':
        console.log('[PROCESS STEP]', message.step, message.message);
        this.emit('process_step', message);
        break;

      // ✅ ADDED: Handle upload progress messages from backend
      case 'upload_progress':
        console.log('[UPLOAD_PROGRESS]', message.status, message.message);
        this.emit('upload_progress', message);
        break;

      // ✅ ADDED: Handle files_stored message (files saved to session before indexing)
      case 'files_stored':
        console.log('[FILES_STORED]', message.files?.length, 'files stored');
        this.emit('files_stored', message);
        break;


      case 'chat_connected':
        this.emit('chat_connected', message);
        break;

      case 'chat_typing':
        this.emit('chat_typing', message);
        break;

      case 'chat_complete':
        this.emit('chat_complete', message);
        break;

      case 'chat_error':
        this.emit('chat_error', message);
        break;

      case 'ping':
        // console.log('[WS] Ping received'); // Optional: uncomment for verbose logging
        this.emit('ping', message);
        break;

      // ✅ FIX: Add missing message type handlers
      case 'data_streaming_complete':
        console.log('[DATA_STREAMING_COMPLETE] All data sent');
        this.emit('data_streaming_complete', message);
        break;

      case 'update_column':
        console.log('[UPDATE_COLUMN] Received:', message);
        this.emit('update_column', message);
        break;

      case 'refine_column_start':
        console.log('[REFINE_COLUMN_START] Received:', message);
        this.emit('refine_column_start', message);
        break;

      case 'delete_column':
        console.log('[DELETE_COLUMN] Received:', message);
        this.emit('delete_column', message);
        break;

      case 'rename_column':
        console.log('%c[WEBSOCKET.js] 🔄 rename_column MESSAGE PARSED 🔄', 'color: blue; font-size: 14px; font-weight: bold');
        console.log('[WEBSOCKET.js] rename_column full message:', JSON.stringify(message, null, 2));
        this.emit('rename_column', message);
        break;

      case 'clear_updating_state':
        console.log('[CLEAR_UPDATING_STATE] Received');
        this.emit('clear_updating_state', message);
        break;

      // ✅ NEW: Handle extraction_query (when backend starts processing a query)
      case 'extraction_query':
        console.log('[EXTRACTION_QUERY] Received:', message);
        this.emit('extraction_query', message);
        break;

      // ✅ NEW: Handle extraction_targeting (tells frontend which rows/columns to animate)
      case 'extraction_targeting':
        console.log('[EXTRACTION_TARGETING] Received:', message);
        this.emit('extraction_targeting', message);
        break;

      // ✅ NEW: Handle indexingComplete (camelCase variant)
      case 'indexingComplete':
        console.log('[INDEXING_COMPLETE] Received');
        this.emit('indexingComplete', message);
        break;

      // ✅ NEW: Handle extraction_stopped when user clicks stop button
      case 'extraction_stopped':
        console.log('[EXTRACTION_STOPPED] Received:', message);
        this.emit('extraction_stopped', message);
        break;

      default:
        console.warn('Unknown message type:', type);
        this.emit('message', message);
    }
  }

  /**
   * Send chat message
   * @param {string} message - Chat message text
   */
  sendChatMessage(message) {
    return this.send({
      type: 'chat_message',
      message: message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start extraction process
   * @param {array} fields - Fields to extract
   * @param {array} fileIds - Optional file IDs to process
   */
  startExtraction(fields, fileIds = null) {
    return this.send({
      type: 'start_extraction',
      fields,
      file_ids: fileIds,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get extraction status
   */
  getStatus() {
    return this.send({
      type: 'get_status',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send ping to server
   */
  ping() {
    return this.send({
      type: 'ping',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Add heartbeat interval for connection health monitoring
   * @param {number} intervalMs - Heartbeat interval in milliseconds (default: 30000)
   */
  addHeartbeat(intervalMs = 30000) {
    this.removeHeartbeat(); // Clear any existing heartbeat
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.ping();
      }
    }, intervalMs);
    console.log(`[WS_SERVICE] Heartbeat started with ${intervalMs}ms interval`);
  }

  /**
   * Remove heartbeat interval
   */
  removeHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[WS_SERVICE] Heartbeat stopped');
    }
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    console.log(`[WS_SERVICE] 📌 Listener ADDED for "${event}". Total listeners: ${this.listeners.get(event).length}`);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {function} callback - Callback function to remove (optional - if not provided, removes ALL listeners for this event)
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return;

    // If no callback provided, remove ALL listeners for this event
    if (!callback) {
      const count = this.listeners.get(event).length;
      this.listeners.delete(event);
      console.log(`[WS_SERVICE] 🗑️ ALL ${count} listeners REMOVED for "${event}"`);
      return;
    }

    // Remove specific callback
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
      console.log(`[WS_SERVICE] 🗑️ Listener REMOVED for "${event}". Remaining: ${callbacks.length}`);
    } else {
      console.log(`[WS_SERVICE] ⚠️ Listener NOT FOUND for "${event}" (stale reference?). Total: ${callbacks.length}`);
    }
  }

  /**
   * Emit event to all registered listeners
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (!this.listeners.has(event)) {
      console.log(`[WS_SERVICE] ⚠️ emit("${event}"): NO LISTENERS REGISTERED!`);
      return;
    }

    const listenerCount = this.listeners.get(event).length;
    console.log(`[WS_SERVICE] 📤 emit("${event}"): Calling ${listenerCount} listener(s)`);

    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }

  /**
   * Ensure WebSocket is connected, reconnect if needed
   * @param {string} sessionId - Optional session ID for reconnection (falls back to stored)
   * @param {string} userId - Optional user ID for Firestore message persistence
   * @returns {Promise<boolean>} True if connected or reconnected successfully
   */
  async ensureConnected(sessionId = null, userId = null) {
    if (this.isConnected()) {
      return true;
    }

    // Use provided sessionId or fall back to stored one
    const sid = sessionId || this.sessionId;
    const uid = userId || this.userId;  // ✅ Use provided or stored userId

    console.log('[WS_SERVICE] ensureConnected: Not connected, attempting reconnect...');
    console.log('[WS_SERVICE] ensureConnected: sessionId provided:', sessionId, 'stored:', this.sessionId);

    if (sid) {
      try {
        // Store the sessionId in case it wasn't stored before
        this.sessionId = sid;
        if (uid) this.userId = uid;  // ✅ Store userId if provided
        await this.connect(sid, getWsUrl(), uid);
        console.log('[WS_SERVICE] ensureConnected: Reconnected successfully!');
        return true;
      } catch (error) {
        console.error('[WS_SERVICE] ensureConnected: Reconnection failed:', error);
        return false;
      }
    }

    console.error('[WS_SERVICE] ensureConnected: No session ID for reconnection');
    return false;
  }

  /**
   * Send message with auto-reconnect
   * @param {object} message - Message to send (should contain session_id)
   * @returns {Promise<boolean>} True if sent successfully
   */
  async sendWithReconnect(message) {
    // Extract sessionId from message for reconnection
    const sessionId = message.session_id || this.sessionId;

    // Ensure connected first
    const connected = await this.ensureConnected(sessionId);
    if (!connected) {
      console.error('[WS_SERVICE] sendWithReconnect: Could not establish connection');
      return false;
    }

    return this.send(message);
  }

  /**
   * Check if WebSocket is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   * @returns {string}
   */
  getState() {
    if (!this.ws) return 'DISCONNECTED';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'CONNECTED';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'DISCONNECTED';
      default:
        return 'UNKNOWN';
    }
  }
}

// Export the class for extension, and singleton instance for direct use
export { WebSocketService };  // Named export of the class
const websocketService = new WebSocketService();
export default websocketService;
