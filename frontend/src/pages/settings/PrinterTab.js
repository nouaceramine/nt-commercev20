/**
 * PrinterTab - Printer & Receipt Settings (Refactored)
 * Before: ~30K lines monolithic | After: ~50 lines composition
 * Refactoring: Extract Hook, Extract Component x4
 * 
 * Sub-components:
 *   - PrinterSettingsCard    : Hardware printer config
 *   - CustomTemplatesTable   : Custom template CRUD
 *   - ReceiptSettingsCard    : Receipt config (auto-print, templates)
 *   - DocumentPrintSettingsCard : Per-document-type settings
 */
import { useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePrinter } from '../../hooks/usePrinter';

import PrinterSettingsCard from '../../components/printer/PrinterSettingsCard';
import CustomTemplatesTable from '../../components/printer/CustomTemplatesTable';
import ReceiptSettingsCard from '../../components/printer/ReceiptSettingsCard';
import DocumentPrintSettingsCard from '../../components/printer/DocumentPrintSettingsCard';

export default function PrinterTab({ initialPrinterSettings, initialReceiptSettings }) {
  const { language } = useLanguage();
  const {
    printerSettings, setPrinterSettings,
    receiptSettings, setReceiptSettings,
    customTemplates, loadingCustom, savingReceipt,
    fetchCustomTemplates,
    deleteCustomTemplate, duplicateCustomTemplate, setDefaultCustomTemplate,
    saveReceiptSettings,
    updateDocumentPrint,
  } = usePrinter({ initialPrinterSettings, initialReceiptSettings });

  useEffect(() => {
    fetchCustomTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6" data-testid="printer-tab">
      <PrinterSettingsCard
        settings={printerSettings}
        onChange={setPrinterSettings}
        language={language}
      />
      <CustomTemplatesTable
        templates={customTemplates}
        loading={loadingCustom}
        language={language}
        onDelete={(id) => deleteCustomTemplate(id, language)}
        onDuplicate={duplicateCustomTemplate}
        onSetDefault={setDefaultCustomTemplate}
      />
      <ReceiptSettingsCard
        settings={receiptSettings}
        onChange={setReceiptSettings}
        onSave={saveReceiptSettings}
        saving={savingReceipt}
        language={language}
      />
      <DocumentPrintSettingsCard
        settings={receiptSettings}
        onUpdate={updateDocumentPrint}
        onSave={saveReceiptSettings}
        saving={savingReceipt}
        language={language}
      />
    </div>
  );
}
