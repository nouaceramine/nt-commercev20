/**
 * Date Format Context - سياق تنسيق التاريخ لكامل التطبيق
 * يضمن استخدام الأرقام الغربية في جميع أنحاء النظام
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import globalDateFormatter, {
  formatShortDate,
  formatLongDate,
  formatTime,
  formatDateTime,
  formatRelative,
  formatCurrency,
  formatNumber,
  formatLargeNumber,
  formatPercent,
  convertToWesternNumerals,
  setConfig,
  getConfig
} from '../utils/globalDateFormatter';

// القيم الافتراضية
const defaultSettings = {
  shortDateFormat: 'yyyy-MM-dd',
  longDateFormat: 'yyyy-MM-dd',
  timeFormat: 'HH:mm:ss',
  useWesternNumerals: true,
  language: 'ar'
};

// إنشاء السياق
const DateFormatContext = createContext({
  settings: defaultSettings,
  formatDate: formatShortDate,
  formatLongDate: formatLongDate,
  formatTime: formatTime,
  formatDateTime: formatDateTime,
  formatRelative: formatRelative,
  formatCurrency: formatCurrency,
  formatNumber: formatNumber,
  formatLargeNumber: formatLargeNumber,
  formatPercent: formatPercent,
  convertToWestern: convertToWesternNumerals,
  updateSettings: () => {},
  refreshSettings: () => {}
});

// مزود السياق
export function DateFormatProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  // تحميل الإعدادات من السيرفر
  const loadSettings = useCallback(async () => {
    try {
      const res = await apiClient.get(`/settings/datetime`);
      const serverSettings = {
        shortDateFormat: res.data.short_date_format || 'yyyy-MM-dd',
        longDateFormat: res.data.long_date_format || 'yyyy-MM-dd',
        timeFormat: res.data.time_format || 'HH:mm:ss',
        useWesternNumerals: res.data.use_western_numerals !== false, // افتراضي true
        language: res.data.language || 'ar'
      };
      
      setSettings(serverSettings);
      setConfig(serverSettings);
    } catch (error) {
      // استخدام الإعدادات الافتراضية عند الفشل
      setConfig(defaultSettings);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // تحديث الإعدادات
  const updateSettings = useCallback(async (newSettings) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    setConfig(updated);

    try {
      await apiClient.put(`/settings/datetime`, {
        short_date_format: updated.shortDateFormat,
        long_date_format: updated.longDateFormat,
        time_format: updated.timeFormat,
        use_western_numerals: updated.useWesternNumerals,
        language: updated.language
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // تحميل الإعدادات عند بدء التطبيق
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // القيم المُصدّرة
  const value = {
    settings,
    loading,
    
    // دوال التنسيق
    formatDate: formatShortDate,
    formatLongDate: formatLongDate,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    formatRelative: formatRelative,
    formatCurrency: formatCurrency,
    formatNumber: formatNumber,
    formatLargeNumber: formatLargeNumber,
    formatPercent: formatPercent,
    convertToWestern: convertToWesternNumerals,
    
    // إدارة الإعدادات
    updateSettings,
    refreshSettings: loadSettings
  };

  return (
    <DateFormatContext.Provider value={value}>
      {children}
    </DateFormatContext.Provider>
  );
}

// Hook لاستخدام السياق
export function useDateFormat() {
  const context = useContext(DateFormatContext);
  if (!context) {
    throw new Error('useDateFormat must be used within a DateFormatProvider');
  }
  return context;
}

// تصدير الدوال المباشرة للاستخدام السريع
export {
  formatShortDate,
  formatLongDate,
  formatTime,
  formatDateTime,
  formatRelative,
  formatCurrency,
  formatNumber,
  formatLargeNumber,
  formatPercent,
  convertToWesternNumerals
};

export default DateFormatContext;
