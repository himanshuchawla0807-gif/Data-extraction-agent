# Data Extraction Agent - React Frontend

Real-time data extraction interface with WebSocket integration for extracting structured data from financial documents.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Backend server running on http://localhost:8000

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at **http://localhost:5173**

## 📋 Features

- **File Upload**: Drag & drop interface for PDF, DOCX, XLSX, CSV files
- **Real-time Extraction**: WebSocket-based live data streaming
- **Editable Table**: Interactive table with real-time data updates
- **Extraction Progress**: Visual progress tracking for each file
- **Citation Support**: View source references for extracted data
- **Auto-Reconnection**: Automatic WebSocket reconnection on disconnect

## 🏗️ Architecture

```
src/
├── components/
│   ├── FileUpload.jsx           # File upload with drag & drop
│   ├── ExtractionStatus.jsx     # Real-time progress display
│   └── Table.jsx                 # Editable data table
├── services/
│   ├── websocket.js              # WebSocket client
│   └── api.js                    # HTTP API client (Axios)
├── App.jsx                       # Main application component
└── style.css                     # Global styles
```

## 🔌 Backend Connection

### WebSocket
- **URL**: `ws://localhost:8000/api/data-extraction/ws/{session_id}`
- **Protocol**: JSON-based message exchange
- **Auto-reconnect**: Yes, with exponential backoff

### HTTP API
- **Base URL**: `http://localhost:8000/api/data-extraction`
- **Upload**: `POST /upload` (multipart/form-data)
- **Health**: `GET /health`

## 📡 WebSocket Events

### Received from Backend
- `welcome` - Connection established
- `upload_complete` - Files uploaded successfully
- `indexing_complete` - Files indexed and ready
- `extraction_progress` - Progress update for a file
- `extraction_result` - Individual field extraction result
- `extraction_complete` - All extraction completed
- `error` - Error occurred

### Sent to Backend
- `start_extraction` - Begin extraction with specified fields
- `get_status` - Request current extraction status
- `ping` - Keep-alive ping

## 🎯 Usage Flow

1. **Connect**: WebSocket connection established automatically on load
2. **Define Fields**: Add column headers in the table (these become extraction fields)
3. **Upload Files**: Drag & drop or select files to upload
4. **Wait for Indexing**: Backend indexes files using LlamaIndex
5. **Extraction Begins**: Data extracted using Gemini 2.5 Flash
6. **Verification**: Data verified using Claude Haiku 4.5
7. **Results Stream**: Real-time updates appear in the table
8. **Export**: Export completed data from the table

## ⚙️ Configuration

### API Endpoints
Edit `src/services/api.js`:
```javascript
const API_BASE_URL = 'http://localhost:8000/api/data-extraction';
```

### WebSocket URL
Edit `src/services/websocket.js`:
```javascript
const DEFAULT_WS_URL = 'ws://localhost:8000/api/data-extraction/ws';
```

## 🎨 Customization

### File Types
Modify allowed file types in `src/components/FileUpload.jsx`:
```javascript
const allowedTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
];
```

### Initial Table Size
Change in `src/App.jsx`:
```javascript
const [state, dispatch] = useReducer(reducer, makeData(20)); // 20 initial rows
```

## 🐛 Debugging

### View WebSocket Messages
Open browser DevTools Console (F12):
```javascript
// Check connection state
websocketService.getState()

// View all listeners
websocketService.listeners

// Send test message
websocketService.send({ type: 'ping' })
```

### View API Requests
DevTools Network tab → Filter by "XHR"

### View WebSocket Traffic
DevTools Network tab → Filter by "WS"

## 📦 Dependencies

### Core
- `react` - UI framework
- `react-dom` - DOM rendering
- `react-table` - Table component

### HTTP & WebSocket
- `axios` - HTTP client for file uploads

### Utilities
- `immutability-helper` - Immutable state updates
- `clsx` - Conditional class names

### Development
- `vite` - Build tool and dev server
- `@vitejs/plugin-react` - React plugin for Vite

## 🚀 Build for Production

```bash
# Build production bundle
npm run build

# Preview production build
npm run serve
```

Production files will be in `dist/` directory.

## 🔧 Troubleshooting

### WebSocket Won't Connect
1. Verify backend is running: `curl http://localhost:8000/health`
2. Check CORS settings in backend `.env`
3. Check browser console for errors
4. Verify WebSocket URL is correct

### Files Won't Upload
1. Check file size (max 600MB)
2. Verify file type is supported
3. Check browser console for errors
4. Verify backend `/upload` endpoint is accessible

### No Data Appears in Table
1. Define column headers before uploading files
2. Verify WebSocket is connected (green status bar)
3. Check browser console for errors
4. Verify backend extraction is working (check logs)

## 📚 Learn More

- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
- [React Table](https://react-table-v7.tanstack.com/)
- [Vite](https://vitejs.dev/)
- [Axios](https://axios-http.com/)

## 📝 License

Proprietary - Oriplex 2025

---

**Status**: ✅ Production Ready  
**Version**: 2.0.0  
**Last Updated**: October 16, 2025
