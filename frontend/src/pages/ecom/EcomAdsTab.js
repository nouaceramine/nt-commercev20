// /ecom-hub/ads — الإعلانات: إحصاءات Leads حسب المصدر + حاسبة ROI
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Megaphone, Calculator } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

export default function EcomAdsTab() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [leadStats, setLeadStats] = useState([]);
  // ROI calculator state
  const [spend, setSpend] = useState(10000);
  const [leads, setLeads] = useState(100);
  const [convRate, setConvRate] = useState(10);
  const [avgOrder, setAvgOrder] = useState(5000);
  // p71: persisted ad spend (real expenses under category "إعلانات ممولة")
  const [adAmount, setAdAmount] = useState('');
  const [adPlatform, setAdPlatform] = useState('facebook');
  const [adDate, setAdDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adMethod, setAdMethod] = useState('cash');
  const [adCurrency, setAdCurrency] = useState('USD');  // p112
  const [adRate, setAdRate] = useState('');             // p112
  const [usdWallet, setUsdWallet] = useState(null);     // p112
  const [adSpends, setAdSpends] = useState([]);
  const [adBusy, setAdBusy] = useState(false);
  const [adProduct, setAdProduct] = useState('');          // p290: ربط الصرف بمنتج (اختياري)
  const [productOpts, setProductOpts] = useState([]);      // p290

  const loadAdSpends = () => {
    apiClient.get('/expenses', { params: { category: 'إعلانات ممولة' } })
      .then(r => {
        const rows = Array.isArray(r.data) ? r.data : (r.data?.items || r.data?.expenses || []);
        setAdSpends(rows.slice(-8).reverse());
      })
      .catch(() => {});
  };
  const loadUsdWallet = () => {  // p112
    apiClient.get('/expenses/usd-wallet')
      .then(r => { setUsdWallet(r.data); if (r.data?.suggested_rate) setAdRate(prev => prev || String(r.data.suggested_rate)); })
      .catch(() => {});
  };
  useEffect(() => { loadAdSpends(); loadUsdWallet(); }, []);
  useEffect(() => {  // p290: قائمة المنتجات لربط الصرف الإعلاني
    apiClient.get('/products', { params: { limit: 500 } })
      .then(r => setProductOpts((Array.isArray(r.data) ? r.data : r.data?.items || []).map(p => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);

  const saveAdSpend = async () => {
    const amount = parseFloat(adAmount) || 0;
    if (amount <= 0) { toast.error(ar ? 'أدخل مبلغاً صحيحاً' : 'Montant invalide'); return; }
    if (adCurrency === 'USD' && !(parseFloat(adRate) > 0)) { toast.error(ar ? 'أدخل سعر صرف الدولار' : 'Taux requis'); return; }  // p112
    setAdBusy(true);
    try {
      const payload = {
        title: `إعلان ممول — ${adPlatform}`,
        category: 'إعلانات ممولة',
        amount,
        payment_method: adCurrency === 'USD' ? '' : adMethod,  // p112: الدولار خُصم من الصندوق عند شرائه
        date: adDate,
      };
      if (adCurrency === 'USD') { payload.currency = 'USD'; payload.exchange_rate = parseFloat(adRate); }  // p112
      if (adProduct) {  // p290: نسبة مباشرة للمنتج في تقرير الربحية
        payload.product_id = adProduct;
        payload.product_name = (productOpts.find(p => p.id === adProduct) || {}).name || '';
      }
      await apiClient.post('/expenses', payload);
      toast.success(ar ? (adCurrency === 'USD' ? 'سُجّل الصرف بالدولار بسعره الحقيقي' : 'سُجّل الصرف الإعلاني وخُصم من الصندوق') : 'Dépense publicitaire enregistrée');
      setAdAmount('');
      loadAdSpends();
      loadUsdWallet();  // p112
    } catch (e) { toast.error(e?.response?.data?.detail || (ar ? 'فشل التسجيل' : 'Échec')); }
    finally { setAdBusy(false); }
  };

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
    <>
      <div className="space-y-6" data-testid="ecom-ads-tab">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="ad-spend-card">
            <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />{ar ? 'تسجيل صرف إعلاني (يُخصم من الصندوق)' : 'Enregistrer une dépense pub'}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2" data-testid="ad-currency-row">
                <Button type="button" size="sm" variant={adCurrency === 'USD' ? 'default' : 'outline'} onClick={() => setAdCurrency('USD')} data-testid="ad-currency-usd">$ دولار (سكوار)</Button>
                <Button type="button" size="sm" variant={adCurrency !== 'USD' ? 'default' : 'outline'} onClick={() => setAdCurrency('DZD')} data-testid="ad-currency-dzd">دج DZD</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{ar ? 'المنصة' : 'Plateforme'}</Label>
                  <select className="w-full border rounded-md h-9 px-2 mt-1 bg-background" value={adPlatform} onChange={e => setAdPlatform(e.target.value)} data-testid="ad-platform-select">
                    <option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="google">Google</option><option value="other">{ar ? 'أخرى' : 'Autre'}</option>
                  </select>
                </div>
                <div className="col-span-2"><Label>{ar ? 'المنتج المُعلَن عنه (اختياري — لنسبة الربحية)' : 'Produit (optionnel)'}</Label>
                  <select className="w-full border rounded-md h-9 px-2 mt-1 bg-background" value={adProduct} onChange={e => setAdProduct(e.target.value)} data-testid="ad-product-select">
                    <option value="">{ar ? '— بدون منتج محدد (يُوزَّع نسبياً) —' : '— Tous les produits —'}</option>
                    {productOpts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div><Label>{adCurrency === 'USD' ? (ar ? 'المبلغ ($)' : 'Montant ($)') : (ar ? 'المبلغ (دج)' : 'Montant (DA)')}</Label><Input type="number" min="0" value={adAmount} onChange={e => setAdAmount(e.target.value)} className="mt-1" data-testid="ad-amount-input" /></div>
                <div><Label>{ar ? 'التاريخ' : 'Date'}</Label><Input type="date" value={adDate} onChange={e => setAdDate(e.target.value)} className="mt-1" data-testid="ad-date-input" /></div>
                {adCurrency !== 'USD' && (
                <div><Label>{ar ? 'الدفع من' : 'Payé depuis'}</Label>
                  <select className="w-full border rounded-md h-9 px-2 mt-1 bg-background" value={adMethod} onChange={e => setAdMethod(e.target.value)} data-testid="ad-method-select">
                    <option value="cash">{ar ? 'الصندوق النقدي' : 'Caisse'}</option><option value="bank">{ar ? 'الحساب البنكي' : 'Banque'}</option><option value="wallet">{ar ? 'المحفظة الإلكترونية' : 'Wallet'}</option><option value="safe">{ar ? 'الخزنة' : 'Coffre'}</option><option value="personal">{ar ? 'المال الخاص' : 'Argent personnel'}</option>
                  </select>
                </div>
                )}
              </div>
              {adCurrency === 'USD' && (
                <div className="border rounded-lg p-3 bg-emerald-50/50 dark:bg-emerald-900/10 space-y-2" data-testid="ad-usd-block">
                  <div><Label>{ar ? 'سعر الصرف (دج لكل 1$)' : 'Taux (DZD/USD)'}</Label>
                    <Input type="number" min="0" step="0.01" dir="ltr" value={adRate} onChange={e => setAdRate(e.target.value)} className="mt-1" data-testid="ad-rate-input" /></div>
                  {adAmount && adRate ? (
                    <p className="text-sm font-semibold text-emerald-700" data-testid="ad-dzd-preview">= {Number(parseFloat(adAmount) * parseFloat(adRate)).toLocaleString()} {ar ? 'دج كلفة حقيقية' : 'DZD'}</p>
                  ) : null}
                  {usdWallet && (
                    <p className="text-xs text-muted-foreground" data-testid="ad-usd-balance">
                      {ar ? `رصيد محفظة الدولار: ${Number(usdWallet.remaining_usd).toLocaleString()}$` : ''}
                      {usdWallet.remaining_usd < (parseFloat(adAmount) || 0) ? (ar ? ' — ⚠️ أقل من المبلغ! سجّل شراء دولار أولاً في صفحة التكاليف' : '') : ''}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{ar ? '💵 لا خصم من الصندوق هنا — الخصم تم عند شراء الدولار' : ''}</p>
                </div>
              )}
              <Button onClick={saveAdSpend} disabled={adBusy} className="w-full" data-testid="ad-spend-save">{ar ? 'تسجيل الصرف' : 'Enregistrer'}</Button>
              {adSpends.length > 0 && (
                <div className="border rounded-lg divide-y text-sm" data-testid="ad-spend-list">
                  {adSpends.map(x => (
                    <div key={x.id} className="flex justify-between p-2">
                      <span>{x.title} <span className="text-xs text-muted-foreground">{(x.date || x.created_at || '').slice(0, 10)}</span></span>
                      <span className="font-semibold">{Number(x.amount).toLocaleString()} دج{x.currency === 'USD' && <span className="text-xs text-muted-foreground" dir="ltr"> ({Number(x.amount_usd).toLocaleString()}$ × {Number(x.exchange_rate).toLocaleString()})</span>}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{ar ? 'تظهر هذه المصاريف تلقائياً في تقرير الربحية الحقيقية (تبويب التحليلات) وفي صفحة المصروفات.' : 'Visibles dans le rapport de rentabilité et les dépenses.'}</p>
            </CardContent>
          </Card>
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
    </>
  );
}
