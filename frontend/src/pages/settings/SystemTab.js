/**
 * SystemTab - System Settings (Refactored)
 * Before: ~24K lines monolithic | After: ~60 lines composition
 * Refactoring: Extract Hook, Extract Component x5
 *
 * Sub-components:
 *   - SystemStatsCard        : System statistics display
 *   - SystemSettingsCard     : General settings form
 *   - BrandingSettingsCard   : Login page branding
 *   - FactoryResetSection    : Factory reset + selective delete dialogs
 *   - BackupRestoreCard      : Backup & restore operations
 */
import { useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSystemSettings } from '../../hooks/useSystemSettings';

import SystemStatsCard from '../../components/system/SystemStatsCard';
import SystemSettingsCard from '../../components/system/SystemSettingsCard';
import BrandingSettingsCard from '../../components/system/BrandingSettingsCard';
import FactoryResetSection from '../../components/system/FactoryResetSection';
import BackupRestoreCard from '../../components/system/BackupRestoreCard';

export default function SystemTab() {
  const { t, language } = useLanguage();
  const {
    systemStats, systemSettings, setSystemSettings,
    brandingSettings, setBrandingSettings,
    backupList, backupLoading,
    savingSystem, savingBranding,
    showResetDialog, setShowResetDialog,
    resetCode, setResetCode,
    resetting,
    showSelectiveDialog, setShowSelectiveDialog,
    selectedDataTypes, setSelectedDataTypes,
    selectiveCode, setSelectiveCode,
    deleting,
    fetchAll, fetchBackupList,
    saveSystemSettings, saveBrandingSettings,
    handleFactoryReset, handleSelectiveDelete,
    downloadBackup, saveBackupToServer, restoreBackup,
  } = useSystemSettings();

  useEffect(() => { fetchAll(); fetchBackupList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6" data-testid="system-tab">
      <SystemStatsCard stats={systemStats} language={language} />
      <SystemSettingsCard
        settings={systemSettings}
        onChange={setSystemSettings}
        onSave={saveSystemSettings}
        saving={savingSystem}
        language={language}
      />
      <BrandingSettingsCard
        settings={brandingSettings}
        onChange={setBrandingSettings}
        onSave={saveBrandingSettings}
        saving={savingBranding}
        language={language}
      />
      <BackupRestoreCard
        backupList={backupList}
        loading={backupLoading}
        onDownload={downloadBackup}
        onSaveToServer={saveBackupToServer}
        onRestore={restoreBackup}
        language={language}
      />
      <FactoryResetSection
        language={language} t={t}
        showResetDialog={showResetDialog} setShowResetDialog={setShowResetDialog}
        resetCode={resetCode} setResetCode={setResetCode}
        resetting={resetting} onFactoryReset={handleFactoryReset}
        showSelectiveDialog={showSelectiveDialog} setShowSelectiveDialog={setShowSelectiveDialog}
        selectedDataTypes={selectedDataTypes} setSelectedDataTypes={setSelectedDataTypes}
        selectiveCode={selectiveCode} setSelectiveCode={setSelectiveCode}
        deleting={deleting} onSelectiveDelete={handleSelectiveDelete}
      />
    </div>
  );
}
