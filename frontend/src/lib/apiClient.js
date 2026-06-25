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
// When impersonating, super-admin-scoped endpoints (motherboard / platform mgmt)
// must use the original super-admin token, not the tenant token.
const SUPER_ADMIN_PATHS = ['/diagnostics', '/platform/features', '/saas/', '/robots', '/cache'];
apiClient.interceptors.request.use((config) => {
  const superToken = localStorage.getItem('super_admin_token');
  const url = config.url || '';
  if (superToken && SUPER_ADMIN_PATHS.some((p) => url.startsWith(p))) {
    config.headers.Authorization = `Bearer ${superToken}`;
    return config;
  }
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle errors globally
const PUBLIC_PATHS = ['/landing', '/pricing', '/register', '/portal', '/login', '/tenant-login', '/agent-login', '/shop'];
const isPublicRoute = () => {
  const p = window.location.pathname;
  return PUBLIC_PATHS.some((pub) => p === pub || p.startsWith(`${pub}/`));
};

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const onPublic = isPublicRoute();
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!onPublic) {
        window.location.href = '/portal';
      }
    } else if (status === 403) {
      if (!onPublic) {
        toast.error('ليس لديك صلاحية للوصول');
      }
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
