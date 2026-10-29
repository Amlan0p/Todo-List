// API configuration. In production, the frontend and API share the same origin.
// Locally, the frontend can use a server on localhost:5000.
const isLocalPage =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

window.APP_CONFIG = {
  API_BASE_URL: isLocalPage ? 'http://localhost:5000' : ''
};
