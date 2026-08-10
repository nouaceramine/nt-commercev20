// /ecom-hub/shipping — الشحن: حالة Yalidine + تتبع الطرود + روابط الإعداد
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { EcomHubTabs } from '../../components/ecom/EcomHubTabs';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Truck, Search, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export default function EcomShippingTab() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [status, setStatus] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [tracking, setTracking] = useState('');
  const [trackResult, setTrackResult] = useState(null);

  useEffect(() => {
    apiClient.get('/integrations/yalidine/status').then(r => setStatus(r.data)).catch(() => {});
    apiClient.get('/integrations/yalidine/parcels').then(r => {
      const d = r.data;
      setParcels(Array.isArray(d) ? d : (d?.parcels || d?.items || []));
    }).catch(() => {});
  }, []);

  const track = async () => {
    if (!tracking.trim()) return;
    try {
      const r = await apiClient.get(`/integrations/yalidine/parcels/${tracking.trim()}`);
      setTrackResult(r.data);
    } catch {
      toast.error(ar ? 'لم يتم العثور على الطرد' : 'Colis introuvable');
      setTrackResult(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="ecom-shipping-tab">
        <EcomHubTabs />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />{ar ? 'تكامل Yalidine' : 'Intégration Yalidine'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  {status?.configured ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-yellow-500" />}
                  <div>
                    <p className="font-medium">{status?.configured ? (ar ? 'مُعدّ وجاهز' : 'Configuré') : (ar ? 'غير مُعدّ' : 'Non configuré')}</p>
                    <p className="text-sm text-muted-foreground">
                      {status?.enabled ? (ar ? 'مفعّل' : 'Activé') : (ar ? 'معطّل' : 'Désactivé')} — {ar ? 'ولاية الإرسال' : 'Wilaya'}: {status?.default_sender_wilaya || '16'}
                    </p>
                  </div>
                </div>
                <Link to="/integrations/yalidine">
                  <Button variant="outline" size="sm" className="gap-1"><Settings className="h-4 w-4" />{ar ? 'الإعدادات' : 'Paramètres'}</Button>
                </Link>
              </div>

              <div>
                <p className="font-medium mb-2">{ar ? 'تتبع طرد' : 'Suivi colis'}</p>
                <div className="flex gap-2">
                  <Input value={tracking} onChange={e => setTracking(e.target.value)} placeholder={ar ? 'رقم التتبع...' : 'N° de suivi...'} dir="ltr" />
                  <Button onClick={track} size="icon" data-testid="track-btn"><Search className="h-4 w-4" /></Button>
                </div>
                {trackResult && (
                  <pre className="mt-3 text-xs bg-muted rounded-lg p-3 overflow-auto max-h-48" dir="ltr">{JSON.stringify(trackResult, null, 2)}</pre>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{ar ? 'آخر الطرود' : 'Derniers colis'}</CardTitle></CardHeader>
            <CardContent>
              {parcels.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{ar ? 'لا توجد طرود بعد' : 'Aucun colis'}</p>
              ) : (
                <div className="space-y-2">
                  {parcels.slice(0, 10).map(p => (
                    <div key={p.id || p.tracking_id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                      <div>
                        <p className="font-medium">{p.customer_name || '—'}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{p.tracking_id || '—'}</p>
                      </div>
                      <Badge variant="secondary">{p.status || 'created'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
