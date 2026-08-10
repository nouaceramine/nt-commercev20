// /ecom-hub/ads — الإعلانات: إحصاءات Leads حسب المصدر + حاسبة ROI
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { EcomHubTabs } from '../../components/ecom/EcomHubTabs';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Megaphone, Calculator } from 'lucide-react';

export default function EcomAdsTab() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [leadStats, setLeadStats] = useState([]);
  // ROI calculator state
  const [spend, setSpend] = useState(10000);
  const [leads, setLeads] = useState(100);
  const [convRate, setConvRate] = useState(10);
  const [avgOrder, setAvgOrder] = useState(5000);

  useEffect(() => {
    apiClient.get('/ecom/leads?limit=500')
      .then(r => {
        const items = Array.isArray(r.data) ? r.data : (r.data?.items || r.data?.leads || []);
        const bySource = {};
        items.forEach(l => { const s = l.source || l.channel || 'manual'; bySource[s] = (bySource[s] || 0) + 1; });
        setLeadStats(Object.entries(bySource).map(([source, count]) => ({ source, count })));
      })
      .catch(() => {});
  }, []);

  const cpl = leads > 0 ? spend / leads : 0;
  const orders = Math.round(leads * (convRate / 100));
  const revenue = orders * avgOrder;
  const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;

  return (
    <Layout>
      <div className="space-y-6" data-testid="ecom-ads-tab">
        <EcomHubTabs />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />{ar ? 'العملاء المحتملون حسب المنصة' : 'Leads par plateforme'}</CardTitle></CardHeader>
            <CardContent>
              {leadStats.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {ar ? 'لا توجد Leads بعد. اربط Webhooks فيسبوك/تيك توك من تبويب القنوات.' : 'Aucun lead. Connectez les webhooks depuis l\'onglet Canaux.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {leadStats.map(s => (
                    <div key={s.source} className="flex items-center justify-between border rounded-lg p-3">
                      <span className="font-medium capitalize">{s.source}</span>
                      <Badge variant="secondary">{s.count} {ar ? 'Lead' : 'leads'}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                {ar ? 'مسارات الاستقبال: POST /api/webhooks/facebook-leads — POST /api/webhooks/tiktok-leads' : 'POST /api/webhooks/facebook-leads — /tiktok-leads'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />{ar ? 'حاسبة عائد الإعلانات (ROI)' : 'Calculateur ROI'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{ar ? 'الميزانية (دج)' : 'Budget (DA)'}</Label><Input type="number" value={spend} onChange={e => setSpend(parseFloat(e.target.value) || 0)} className="mt-1" /></div>
                <div><Label>{ar ? 'عدد Leads' : 'Leads'}</Label><Input type="number" value={leads} onChange={e => setLeads(parseFloat(e.target.value) || 0)} className="mt-1" /></div>
                <div><Label>{ar ? 'نسبة التحويل %' : 'Conversion %'}</Label><Input type="number" value={convRate} onChange={e => setConvRate(parseFloat(e.target.value) || 0)} className="mt-1" /></div>
                <div><Label>{ar ? 'متوسط الطلب (دج)' : 'Panier moyen'}</Label><Input type="number" value={avgOrder} onChange={e => setAvgOrder(parseFloat(e.target.value) || 0)} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="border rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">CPL</p><p className="text-xl font-bold">{cpl.toFixed(0)} {ar ? 'دج' : 'DA'}</p></div>
                <div className="border rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">{ar ? 'طلبات متوقعة' : 'Commandes'}</p><p className="text-xl font-bold">{orders}</p></div>
                <div className="border rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">{ar ? 'إيرادات متوقعة' : 'Revenus'}</p><p className="text-xl font-bold">{revenue.toLocaleString()} {ar ? 'دج' : 'DA'}</p></div>
                <div className={`border rounded-lg p-3 text-center ${roi >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className="text-xs text-muted-foreground">ROI</p>
                  <p className={`text-xl font-bold ${roi >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{roi.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
