/**
 * usePrinter - Printer settings state management
 * Extracted from PrinterTab.js (Refactoring: Extract Hook)
 * Addresses: Large Class, Data Clumps
 */
import { useState, useCallback } from 'react';
import apiClient from '../lib/apiClient';

const DEFAULT_PRINTER_SETTINGS = {
  enabled: false,
  type: 'thermal',
  connectionType: 'usb',
  name: '',
  ipAddress: '',
  port: '9100',
  paperWidth: '80',
  autoPrint: false,
  printCopies: 1,
};

const DEFAULT_RECEIPT_SETTINGS = {
  auto_print: false,
  show_print_dialog: true,
  default_template_id: 'default_80mm',
  thermal_printer_size: '80mm',
  store_name: '',
  store_address: '',
  store_phone: '',
  templates: [
    { id: 'default_58mm', name: 'Thermal 58mm', name_ar: 'حراري 58 مم', width: '58mm', show_logo: false, show_header: true, show_footer: true, header_text: '', footer_text: 'شكراً لزيارتكم', font_size: 'small', is_default: false },
    { id: 'default_80mm', name: 'Thermal 80mm', name_ar: 'حراري 80 مم', width: '80mm', show_logo: true, show_header: true, show_footer: true, header_text: '', footer_text: 'شكراً لزيارتكم', font_size: 'normal', is_default: true },
    { id: 'default_a4', name: 'A4 Full Page', name_ar: 'صفحة A4 كاملة', width: 'A4', show_logo: true, show_header: true, show_footer: true, header_text: '', footer_text: 'شكراً لزيارتكم', font_size: 'normal', is_default: false },
  ],
};

export function usePrinter({ initialPrinterSettings, initialReceiptSettings } = {}) {
  const [printerSettings, setPrinterSettings] = useState(initialPrinterSettings || DEFAULT_PRINTER_SETTINGS);
  const [receiptSettings, setReceiptSettings] = useState(initialReceiptSettings || DEFAULT_RECEIPT_SETTINGS);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);

  // Fetch custom templates
  const fetchCustomTemplates = useCallback(async () => {
    setLoadingCustom(true);
    try {
      const res = await apiClient.get('/printing/templates');
      setCustomTemplates((res.data || []).filter(t => t.is_custom));
    } catch {
      // ignore
    } finally {
      setLoadingCustom(false);
    }
  }, []);

  // Template CRUD operations
  const deleteCustomTemplate = useCallback(async (id, language) => {
    if (!window.confirm(language === 'ar' ? 'هل تريد حذف هذا القالب؟' : 'Supprimer ce modèle ?')) return;
    try {
      await apiClient.delete(`/printing/templates/${id}`);
      setCustomTemplates(prev => prev.filter(t => t.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const duplicateCustomTemplate = useCallback(async (id) => {
    try {
      const res = await apiClient.post(`/printing/templates/${id}/duplicate`);
      setCustomTemplates(prev => [...prev, res.data]);
      return true;
    } catch {
      return false;
    }
  }, []);

  const setDefaultCustomTemplate = useCallback(async (tmpl) => {
    try {
      await apiClient.put(`/printing/templates/${tmpl.id}`, { ...tmpl, is_default: true });
      setCustomTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === tmpl.id })));
      return true;
    } catch {
      return false;
    }
  }, []);

  // Save receipt settings
  const saveReceiptSettings = useCallback(async () => {
    setSavingReceipt(true);
    try {
      await apiClient.post('/settings/receipt', receiptSettings);
      return true;
    } catch {
      return false;
    } finally {
      setSavingReceipt(false);
    }
  }, [receiptSettings]);

  // Template toggle helpers
  const updateTemplateField = useCallback((templateId, field, value) => {
    setReceiptSettings(prev => ({
      ...prev,
      templates: prev.templates.map(t => t.id === templateId ? { ...t, [field]: value } : t),
    }));
  }, []);

  const updateDefaultFooter = useCallback((value) => {
    setReceiptSettings(prev => ({
      ...prev,
      templates: prev.templates.map(t =>
        t.id === prev.default_template_id ? { ...t, footer_text: value } : t
      ),
    }));
  }, []);

  // Document print settings
  const updateDocumentPrint = useCallback((docType, patch) => {
    const { DEFAULT_DOC_OPTIONS } = require('../lib/printDocuments');
    setReceiptSettings(prev => ({
      ...prev,
      document_print: {
        ...(prev.document_print || {}),
        [docType]: { ...DEFAULT_DOC_OPTIONS[docType], ...(prev.document_print?.[docType] || {}), ...patch },
      },
    }));
  }, []);

  return {
    // State
    printerSettings, setPrinterSettings,
    receiptSettings, setReceiptSettings,
    customTemplates, setCustomTemplates,
    loadingCustom, savingReceipt,
    // Actions
    fetchCustomTemplates,
    deleteCustomTemplate,
    duplicateCustomTemplate,
    setDefaultCustomTemplate,
    saveReceiptSettings,
    updateTemplateField,
    updateDefaultFooter,
    updateDocumentPrint,
  };
}
