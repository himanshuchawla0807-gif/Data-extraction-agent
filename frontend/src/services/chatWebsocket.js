/**
 * ChatWebSocketService - Dedicated WebSocket for Chat Messages
 * Extends WebSocketService to provide isolated chat channel with heartbeat support.
 * Uses /api/ws/{sessionId} (shared with main WS) - chat messages are differentiated by type.
 */

import { WebSocketService } from './websocket.js';
import { getWsUrl } from '../config';

class ChatWebSocketService extends WebSocketService {
    constructor() {
        super();
        this.heartbeatInterval = null;
    }

    /**
     * Connect to chat WebSocket server
     * @param {string} sessionId - Unique session identifier
     * @param {string} url - WebSocket server URL (default: localhost:8001/api/ws - same as main WS)
     */
    connect(sessionId, url = getWsUrl(), userId = null, token = null) {
        return super.connect(sessionId, url, userId, token);
    }

    /**
     * Add heartbeat for chat connection
     * @param {string} sessionId - Session ID (for logging context)
     */
    addHeartbeat(sessionId) {
        this.removeHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                this.ping();
                console.log('[CHAT_WS] Heartbeat ping sent');
            } else {
                console.warn('[CHAT_WS] Heartbeat detected disconnection, attempting reconnect...');
                this.ensureConnected(sessionId);
            }
        }, 30000); // 30 second heartbeat
        console.log('[CHAT_WS] Heartbeat started for session:', sessionId);
    }

    /**
     * Remove heartbeat interval
     */
    removeHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('[CHAT_WS] Heartbeat stopped');
        }
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this.removeHeartbeat();
        super.disconnect();
    }
}

// Export singleton instance
const chatWebsocketService = new ChatWebSocketService();
export default chatWebsocketService;
