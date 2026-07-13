/**
 * useSystemSettings - System settings state management
 * Extracted from SystemTab.js (Refactoring: Extract Hook)
 * Addresses: Large Class, Data Clumps
 */
import { useState, useCallback } from 'react';
import apiClient from '../lib/apiClient';

const DEFAULT_SYSTEM_SETTINGS = {
  cash_difference_threshold: 1000,
  low_stock_threshold: 10,
  currency_symbol: 'دج',
  business_name: 'NT',
};

const DEFAULT_BRANDING = {
  logo_url: '',
  business_name: 'NT',
  background_image_url: '',
  tagline_ar: '',
  tagline_fr: '',
};

export function useSystemSettings() {
  const [systemStats, setSystemStats] = useState(null);
  const [systemSettings, setSystemSettings] = useState(DEFAULT_SYSTEM_SETTINGS);
  const [brandingSettings, setBrandingSettings] = useState(DEFAULT_BRANDING);
  const [backupList, setBackupList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  // Dialog states
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showSelectiveDialog, setShowSelectiveDialog] = useState(false);
  const [selectedDataTypes, setSelectedDataTypes] = useState([]);
  const [selectiveCode, setSelectiveCode] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, sysRes, brandRes] = await Promise.all([
        apiClient.get('/system/stats').catch(() => ({ data: null })),
        apiClient.get('/system/settings').catch(() => ({ data: null })),
        apiClient.get('/branding/settings').catch(() => ({ data: null })),
      ]);
      if (statsRes.data) setSystemStats(statsRes.data);
      if (sysRes.data) setSystemSettings(sysRes.data);
      if (brandRes.data) setBrandingSettings(brandRes.data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchBackupList = useCallback(async () => {
    try {
      const res = await apiClient.get('/backup/list');
      setBackupList(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const saveSystemSettings = useCallback(async () => {
    setSavingSystem(true);
    try {
      await apiClient.put('/system/settings', systemSettings);
      return true;
    } catch { return false; }
    finally { setSavingSystem(false); }
  }, [systemSettings]);

  const saveBrandingSettings = useCallback(async () => {
    setSavingBranding(true);
    try {
      await apiClient.put('/branding/settings', brandingSettings);
      return true;
    } catch { return false; }
    finally { setSavingBranding(false); }
  }, [brandingSettings]);

  const handleFactoryReset = useCallback(async () => {
    setResetting(true);
    try {
      await apiClient.post('/system/factory-reset', null, { params: { confirm_code: resetCode } });
      return true;
    } catch { return false; }
    finally { setResetting(false); }
  }, [resetCode]);

  const handleSelectiveDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await apiClient.post('/system/selective-delete', {
        data_types: selectedDataTypes,
        confirm_code: selectiveCode,
      });
      return true;
    } catch { return false; }
    finally { setDeleting(false); }
  }, [selectedDataTypes, selectiveCode]);

  const downloadBackup = useCallback(async () => {
    setBackupLoading(true);
    try {
      const res = await apiClient.get('/backup/create', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      return true;
    } catch { return false; }
    finally { setBackupLoading(false); }
  }, []);

  const saveBackupToServer = useCallback(async () => {
    setBackupLoading(true);
    try {
      await apiClient.post('/backup/save-to-server', {});
      return true;
    } catch { return false; }
    finally { setBackupLoading(false); }
  }, []);

  const restoreBackup = useCallback(async (file) => {
    setBackupLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiClient.post('/backup/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return true;
    } catch { return false; }
    finally { setBackupLoading(false); }
  }, []);

  return {
    // State
    systemStats, systemSettings, setSystemSettings,
    brandingSettings, setBrandingSettings,
    backupList, backupLoading,
    savingSystem, savingBranding,
    // Dialogs
    showResetDialog, setShowResetDialog,
    resetCode, setResetCode,
    resetting,
    showSelectiveDialog, setShowSelectiveDialog,
    selectedDataTypes, setSelectedDataTypes,
    selectiveCode, setSelectiveCode,
    deleting,
    // Actions
    fetchAll, fetchBackupList,
    saveSystemSettings, saveBrandingSettings,
    handleFactoryReset, handleSelectiveDelete,
    downloadBackup, saveBackupToServer, restoreBackup,
  };
}
