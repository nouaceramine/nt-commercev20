import { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState(null);
  const [limits, setLimits] = useState(null);
  
  // Check token on mount
  useEffect(() => {
    // Clean up stale impersonation state: super_admin_token without is_impersonating flag
    // indicates the user logged out or a stale token survived a refresh.
    if (typeof window !== 'undefined') {
      const hasFlag = localStorage.getItem('is_impersonating') === '1';
      const hasSuperToken = !!localStorage.getItem('super_admin_token');
      if (hasSuperToken && !hasFlag) {
        localStorage.removeItem('super_admin_token');
        localStorage.removeItem('super_admin_user');
      }
    }
    const verifyToken = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      
      try {
        const response = await apiClient.get(`/auth/me`);
        // Merge with localStorage data to get user_type
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userData = {
          ...response.data,
          user_type: response.data.user_type || storedUser.user_type
        };
        setUser(userData);
        // Set features and limits from response
        setFeatures(response.data.features || null);
        setLimits(response.data.limits || null);
      } catch (error) {
        console.error('Token verification failed:', error);
        logout();
      } finally {
        setLoading(false);
      }
    };
    
    verifyToken();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const login = async (email, password) => {
    const response = await apiClient.post(`/auth/login`, { email, password });
    const { access_token, user: userData, user_type, redirect_to } = response.data;
    
    localStorage.setItem('token', access_token);
    localStorage.setItem('user_type', user_type || 'admin');
    localStorage.setItem('redirect_to', redirect_to || '/');
    setToken(access_token);
    setUser(userData);
    // Set features and limits from login response
    setFeatures(userData.features || null);
    setLimits(userData.limits || null);
    
    return { ...userData, user_type, redirect_to };
  };
  
  const register = async (email, password, name, role = 'user') => {
    const response = await apiClient.post(`/auth/register`, { 
      email, 
      password, 
      name,
      role 
    });
    const { access_token, user: userData } = response.data;
    
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    
    return userData;
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('user_type');
    // Always clean up any impersonation context on logout
    localStorage.removeItem('super_admin_token');
    localStorage.removeItem('super_admin_user');
    localStorage.removeItem('is_impersonating');
    localStorage.removeItem('impersonation_session_id');
    setToken(null);
    setUser(null);
    setFeatures(null);
    setLimits(null);
  };
  
  /**
   * Check if a feature flag is enabled for the current tenant.
   *
   * Handles two formats stored in `features`:
   *   1. Flat boolean:  features = { recharge: false, iptv: true, ... }
   *   2. Nested object: features = { inventory: { enabled: false, subFeatures: {...} } }
   *
   * Super admins always return true. Missing/undefined flags default to enabled.
   */
  /**
   * Opt-in features default to DISABLED when the resolved features map doesn't
   * mention them — i.e. they must be explicitly enabled (super-admin per-tenant).
   * Mirrors OPT_IN_FEATURES in backend main.py.
   */
  const OPT_IN_FEATURES = new Set(['ecommerce_hub']);

  const isFeatureEnabled = (featureKey, subFeatureKey = null) => {
    // Super admin has all features
    if (user?.role === 'super_admin') return true;
    // If no features set, allow all (default behavior) — but still gate opt-in ones.
    if (!features) return !OPT_IN_FEATURES.has(featureKey);

    const feature = features[featureKey];

    // Feature key not present → enabled by default UNLESS it's opt-in
    if (feature === undefined || feature === null) {
      return !OPT_IN_FEATURES.has(featureKey);
    }

    // ── Flat boolean flag (new per-tenant override format) ──
    if (typeof feature === 'boolean') {
      return feature;
    }

    // ── Nested object (existing plan-level format) ──
    if (typeof feature === 'object') {
      if (feature.enabled === false) return false;
      if (subFeatureKey && feature.subFeatures) {
        return feature.subFeatures[subFeatureKey] !== false;
      }
    }

    return true;
  };
  
  // Admin includes both 'admin' and 'super_admin' roles
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const isTenant = user?.user_type === 'tenant' || user?.role === 'tenant_admin';
  const isAgent = user?.user_type === 'agent' || user?.role === 'agent';
  const isCashier = user?.role === 'cashier';
  // Super-admin impersonating a tenant: we require BOTH the preserved super-admin token
  // AND an explicit is_impersonating flag to avoid stale state granting elevated access.
  const isImpersonating = typeof window !== 'undefined'
    && localStorage.getItem('is_impersonating') === '1'
    && !!localStorage.getItem('super_admin_token');
  // Treat the impersonating user as super-admin for platform-page access (motherboard, etc.)
  const isEffectiveSuperAdmin = isSuperAdmin || isImpersonating;

  const stopImpersonation = () => {
    const origToken = localStorage.getItem('super_admin_token');
    const origUser = localStorage.getItem('super_admin_user');
    const sessionId = localStorage.getItem('impersonation_session_id');
    // Fire-and-forget: close the audit log entry (uses super-admin token via apiClient interceptor)
    if (sessionId) {
      // We must call BEFORE we wipe localStorage because apiClient needs super_admin_token
      apiClient.post(`/saas/impersonate/${sessionId}/stop`).catch(() => {});
    }
    if (origToken) localStorage.setItem('token', origToken);
    if (origUser) localStorage.setItem('user', origUser);
    localStorage.removeItem('super_admin_token');
    localStorage.removeItem('super_admin_user');
    localStorage.removeItem('is_impersonating');
    localStorage.removeItem('user_type');
    localStorage.removeItem('impersonation_session_id');
    window.location.href = '/saas-admin';
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAdmin,
    isSuperAdmin,
    isEffectiveSuperAdmin,
    isImpersonating,
    stopImpersonation,
    isTenant,
    isAgent,
    isCashier,
    isAuthenticated: !!user,
    features,
    limits,
    isFeatureEnabled
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
