export const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:8101';

export const API_BASE_URL = `${API_ROOT}/api`;

export const getWsUrl = (path = '/api/ws') => {
    const protocol = API_ROOT.startsWith('https') ? 'wss' : 'ws';
    const host = API_ROOT.replace(/^https?:\/\//, '');
    // Remove trailing slash if present
    const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
    return `${protocol}://${cleanHost}${path}`;
};
