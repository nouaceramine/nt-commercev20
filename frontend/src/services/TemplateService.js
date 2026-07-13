/**
 * TemplateService - Template CRUD & branding API operations
 * Extracted from TemplateEditorPage.js (Refactoring: Move Method)
 * Addresses: Feature Envy (API calls don't belong in the page component)
 */
import apiClient from '../lib/apiClient';
import { getPrinterType } from '../lib/templateConstants';

export class TemplateService {
  /**
   * Load branding settings
   */
  static async loadBranding() {
    try {
      const res = await apiClient.get('/settings/tenant-branding');
      return res.data || {};
    } catch {
      return {};
    }
  }

  /**
   * Load a single template by ID
   */
  static async loadTemplate(id) {
    if (!id) return null;
    try {
      const res = await apiClient.get('/printing/templates');
      return (res.data || []).find(t => t.id === id) || null;
    } catch {
      return null;
    }
  }

  /**
   * Save template (create or update)
   */
  static async saveTemplate({ id, name_ar, name_fr, docType, paperWidth, accentColor, blocks }) {
    const payload = {
      name_ar,
      name_fr,
      type: docType,
      printer_type: getPrinterType(paperWidth),
      paper_width: paperWidth,
      is_custom: true,
      blocks,
      accent_color: accentColor,
      template_html: '',
    };
    if (id) {
      await apiClient.put(`/printing/templates/${id}`, payload);
    } else {
      await apiClient.post('/printing/templates', payload);
    }
  }

  /**
   * Build payload object for save (for optimistic updates)
   */
  static buildPayload({ name_ar, name_fr, docType, paperWidth, accentColor, blocks }) {
    return {
      name_ar,
      name_fr,
      type: docType,
      printer_type: getPrinterType(paperWidth),
      paper_width: paperWidth,
      is_custom: true,
      blocks,
      accent_color: accentColor,
      template_html: '',
    };
  }
}
