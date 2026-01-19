// Hardcoded API configuration
export const API_BASE_URL = 'https://remote-tv-backend-24871831085.us-central1.run.app/api';
export const SOCKET_URL = 'https://remote-tv-backend-24871831085.us-central1.run.app';
// Python backend URL - this is used by the Node.js backend, not directly by frontend
// Frontend should use API_BASE_URL for all requests, backend will proxy to Python
export const PYTHON_BACKEND_URL = 'http://106.51.69.50:5042';

console.log('🔍 [Config] API Base URL:', API_BASE_URL);
console.log('🔍 [Config] Socket URL:', SOCKET_URL);
console.log('🔍 [Config] Python Backend URL:', PYTHON_BACKEND_URL);
