/**
 * Centralized API Client for NT Commerce
 * All API calls should use this module
 */
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const apiClient = axios.create({
  baseURL: `${API}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request interceptor - auto-attach auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    } else if (status === 403) {
      toast.error('ليس لديك صلاحية للوصول');
    } else if (status === 429) {
      toast.error('طلبات كثيرة. حاول لاحقاً');
    } else if (status >= 500) {
      toast.error('خطأ في الخادم');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
export { API };
