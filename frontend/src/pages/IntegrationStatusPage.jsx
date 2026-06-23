import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useLanguage } from '../contexts/LanguageContext';
import { CreditCard, Mail, MessageSquare, Truck, Bell, CheckCircle, AlertCircle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function IntegrationStatusPage() {
  const { language } = useLanguage();
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatuses = async () => {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const endpoints = {
        email: '/api/integrations/email/status',
        whatsapp: '/api/integrations/whatsapp/status',
        yalidine: '/api/integrations/yalidine/status',
        stripe: '/api/payments/packages',
        push: '/api/push/status',
      };
      const results = {};
      for (const [key, url] of Object.entries(endpoints)) {
        try {
          const res = await fetch(`${API}${url}`, { headers });
          if (res.ok) {
            const data = await res.json();
            results[key] = { ...data, available: true };
          } else {
            results[key] = { available: false, configured: false };
          }
        } catch {
          results[key] = { available: false, configured: false };
        }
      }
      setStatuses(results);
      setLoading(false);
    };
    fetchStatuses();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const integrations = [
    { key: 'stripe', name: 'Stripe', desc: language === 'ar' ? 'بوابة الدفع الإلكتروني' : 'Payment Gateway', icon: CreditCard, color: 'bg-purple-500' },
    { key: 'email', name: 'SendGrid', desc: language === 'ar' ? 'إرسال البريد الإلكتروني' : 'Email Delivery', icon: Mail, color: 'bg-blue-500' },
    { key: 'whatsapp', name: 'WhatsApp', desc: language === 'ar' ? 'رسائل واتساب للأعمال' : 'WhatsApp Business', icon: MessageSquare, color: 'bg-green-500' },
    { key: 'yalidine', name: 'Yalidine', desc: language === 'ar' ? 'شحن وتوصيل (الجزائر)' : 'Shipping & Delivery', icon: Truck, color: 'bg-orange-500' },
    { key: 'push', name: language === 'ar' ? 'الإشعارات الفورية' : 'Push Notifications', desc: language === 'ar' ? 'إشعارات المتصفح' : 'Browser Notifications', icon: Bell, color: 'bg-red-500' },
  ];

  const StatusIcon = ({ configured }) => {
    if (configured) return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  return (
    <Layout>
    <div className="space-y-6" data-testid="integration-status-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="integration-status-title">
          {language === 'ar' ? 'حالة التكاملات' : 'Integration Status'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {language === 'ar' ? 'إدارة ومراقبة جميع التكاملات الخارجية' : 'Manage and monitor all external integrations'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5].map(i => (
            <Card key={`item-${i}`} className="animate-pulse"><CardContent className="h-32" /></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map(({ key, name, desc, icon: Icon, color }) => {
            const status = statuses[key] || {};
            const isConfigured = key === 'stripe' ? status.available : status.configured;
            const isPush = key === 'push';
            return (
              <Card key={key} data-testid={`integration-card-${key}`} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className={`${color} p-2 rounded-lg text-white`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-base">{name}</CardTitle>
                  </div>
                  <Badge variant={isConfigured ? "default" : "secondary"} data-testid={`integration-badge-${key}`}>
                    {isConfigured 
                      ? (language === 'ar' ? 'مُعد' : 'Configured')
                      : (language === 'ar' ? 'غير مُعد' : 'Not Configured')}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{desc}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <StatusIcon configured={isConfigured} />
                    <span>
                      {isConfigured 
                        ? (isPush && status.subscribed
                            ? `${status.devices} ${language === 'ar' ? 'جهاز مشترك' : 'subscribed devices'}`
                            : (language === 'ar' ? 'جاهز للاستخدام' : 'Ready to use'))
                        : (language === 'ar' ? 'يحتاج إعداد مفتاح API' : 'API key setup required')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </Layout>
  );
}
