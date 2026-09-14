import axios from 'axios';
import { getApiBaseUrl } from './baseUrl';

export const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to prepend configured base URL (for native app pointing to remote server)
api.interceptors.request.use((config) => {
  if (!config.baseURL || config.baseURL === '/api') {
    config.baseURL = getApiBaseUrl() + '/api';
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'An error occurred';
    console.error('API Error:', message);

    // Could integrate with toast notifications here
    // toast.error(message);

    return Promise.reject(error);
  }
);

// Request interceptor for logging (development only)
if (import.meta.env.DEV) {
  api.interceptors.request.use((config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  });
}
