import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../lib/apiClient';

const FeatureFlagContext = createContext({
  enabled: [],
  loaded: false,
  isEnabled: () => true,
  reload: () => {},
});

export function FeatureFlagProvider({ children }) {
  const [enabled, setEnabled] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/platform/features/public');
      setEnabled(res.data.enabled || []);
      loadedOnce.current = true;
    } catch {
      if (!loadedOnce.current) {
        setEnabled([]);
        loadedOnce.current = true;
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEnabled = useCallback(
    (key) => {
      if (!key) return true;
      if (!loadedOnce.current || enabled.length === 0) return true;
      return enabled.includes(key);
    },
    [enabled]
  );

  return (
    <FeatureFlagContext.Provider value={{ enabled, loaded, isEnabled, reload: load }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext);
}

export function useFeatureFlag(key) {
  const { isEnabled } = useContext(FeatureFlagContext);
  return isEnabled(key);
}
