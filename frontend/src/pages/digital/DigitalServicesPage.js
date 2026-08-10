// /digital-services — متجر الخدمات الرقمية: منتجات، شراء فوري، محفظة، طلبات، إحالة
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Smartphone, Gift, Wifi, CreditCard, Wallet, ShoppingBag, Share2, Copy, Check, ArrowUpCircle, Package } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

const TYPE_META = {
  MOBILE_TOPUP: { ar: 'تعبئة هاتف', icon: Smartphone },
  INTERNET_BUNDLE: { ar: 'باقة إنترنت', icon: Wifi },
  GIFT_CARD: { ar: 'بطاقة هدية', icon: Gift },
  SUBSCRIPTION: { ar: 'اشتراك', icon: CreditCard },
};
const PROVIDER_COLORS = { ooredoo: 'bg-red-500', djezzy: 'bg-orange-500', mobilis: 'bg-green-600' };

export default function DigitalServicesPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [products, setProducts] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [affiliate, setAffiliate] = useState(null);
  const [loading, setLoading] = useState(true);
  // checkout
  const [checkoutProduct, setCheckoutProduct] = useState(null);
  const [targetPhone, setTargetPhone] = useState('');
  const [payMethod, setPayMethod] = useState('wallet');
  const [buying, setBuying] = useState(false);
  // delivery
  const [delivery, setDelivery] = useState(null); // {order_number, product_name, codes}
  const [copied, setCopied] = useState('');
  // deposit
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, w, o, a] = await Promise.all([
        apiClient.get('/digital/products').catch(() => ({ data: [] })),
        apiClient.get('/digital/wallet').catch(() => ({ data: null })),
        apiClient.get('/digital/orders').catch(() => ({ data: [] })),
        apiClient.get('/digital/affiliate').catch(() => ({ data: null })),
      ]);
      setProducts(Array.isArray(p.data) ? p.data : []);
      if (w.data) { setWallet(w.data.wallet); setTransactions(w.data.transactions || []); }
      setOrders(Array.isArray(o.data) ? o.data : []);
      setAffiliate(a.data && a.data.code ? a.data : null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const buy = async () => {
    setBuying(true);
    try {
      const r = await apiClient.post('/digital/orders', {
        product_id: checkoutProduct.id,
        target_phone: targetPhone,
        payment_method: payMethod,
        quantity: 1,
      });
      const order = r.data;
      setCheckoutProduct(null);
      if (order.status === 'COMPLETED' && payMethod === 'wallet') {
        const codes = await apiClient.get(`/digital/orders/${order.id}/codes`);
        setDelivery(codes.data);
      } else {
        toast.success(ar ? 'تم إنشاء الطلب — بانتظار تأكيد الدفع' : 'Commande créée');
      }
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الشراء' : 'Échec'));
    } finally { setBuying(false); }
  };

  const deposit = async () => {
    try {
      const r = await apiClient.post('/digital/wallet/deposit', { amount: parseFloat(depositAmount) || 0 });
      toast.success(ar ? `الرصيد الجديد: ${r.data.balance} دج` : `Solde: ${r.data.balance} DA`);
      setDepositOpen(false); setDepositAmount('');
      loadAll();
    } catch (e) { toast.error(e.response?.data?.detail || (ar ? 'فشل الشحن' : 'Échec')); }
  };

  const activateAffiliate = async () => {
    try {
      const r = await apiClient.post('/digital/affiliate');
      setAffiliate(r.data);
      toast.success(ar ? 'تم تفعيل رابط الإحالة' : 'Lien activé');
    } catch { toast.error(ar ? 'فشل التفعيل' : 'Échec'); }
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const viewOrderCodes = async (order) => {
    if (order.status !== 'COMPLETED' || !(order.code_ids || []).length) {
      toast.info(ar ? 'لا توجد أكواد لهذا الطلب بعد' : 'Pas de codes');
      return;
    }
    const codes = await apiClient.get(`/digital/orders/${order.id}/codes`);
    setDelivery(codes.data);
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="digital-services-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{ar ? 'الخدمات الرقمية' : 'Services numériques'}</h1>
            <p className="text-muted-foreground mt-1">{ar ? 'تعبئة، بطاقات هدايا واشتراكات بتسليم فوري' : 'Recharges, cartes cadeaux et abonnements'}</p>
          </div>
        </div>

        <Tabs defaultValue="store">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="store" className="gap-1"><Package className="h-4 w-4" />{ar ? 'المتجر' : 'Boutique'}</TabsTrigger>
            <TabsTrigger value="wallet" className="gap-1"><Wallet className="h-4 w-4" />{ar ? 'محفظتي' : 'Portefeuille'}</TabsTrigger>
            <TabsTrigger value="orders" className="gap-1"><ShoppingBag className="h-4 w-4" />{ar ? 'طلباتي' : 'Commandes'}</TabsTrigger>
            <TabsTrigger value="affiliate" className="gap-1"><Share2 className="h-4 w-4" />{ar ? 'الإحالة' : 'Affiliation'}</TabsTrigger>
          </TabsList>

          {/* ── Store ── */}
          <TabsContent value="store">
            {loading ? <p className="text-center py-12 text-muted-foreground">{ar ? 'جارٍ التحميل...' : 'Chargement...'}</p> :
             products.length === 0 ? (
              <div className="text-center py-16">
                <Gift className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{ar ? 'لا توجد منتجات رقمية بعد' : 'Aucun produit'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map(p => {
                  const Meta = TYPE_META[p.type] || TYPE_META.GIFT_CARD;
                  const Icon = Meta.icon;
                  const pColor = PROVIDER_COLORS[(p.provider || '').toLowerCase()] || 'bg-slate-500';
                  const out = p.stock === 0 && (p.delivery_method === 'INSTANT_CODE' || p.delivery_method === 'QR_CODE');
                  return (
                    <Card key={p.id} className="overflow-hidden" data-testid={`digital-product-${p.id}`}>
                      <div className={`h-2 ${pColor}`} />
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg ${pColor} text-white`}><Icon className="h-5 w-5" /></div>
                            <div>
                              <p className="font-semibold">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.provider || Meta.ar}</p>
                            </div>
                          </div>
                          {out
                            ? <Badge variant="destructive">{ar ? 'نفدت الكمية' : 'Épuisé'}</Badge>
                            : <Badge className="bg-emerald-100 text-emerald-700">{ar ? 'متوفر' : 'Disponible'}</Badge>}
                        </div>
                        <p className="text-2xl font-bold text-primary">{p.price?.toLocaleString()} {ar ? 'دج' : 'DA'}</p>
                        <Button className="w-full" disabled={out} onClick={() => { setCheckoutProduct(p); setPayMethod('wallet'); setTargetPhone(''); }}
                          data-testid={`buy-${p.id}`}>
                          {ar ? 'اشترِ الآن' : 'Acheter'}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Wallet ── */}
          <TabsContent value="wallet">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader><CardTitle>{ar ? 'الرصيد الحالي' : 'Solde actuel'}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-4xl font-bold text-primary">{(wallet?.balance ?? 0).toLocaleString()} {ar ? 'دج' : 'DA'}</p>
                  <Button className="w-full gap-2" onClick={() => setDepositOpen(true)} data-testid="deposit-btn">
                    <ArrowUpCircle className="h-4 w-4" />{ar ? 'شحن الرصيد' : 'Recharger'}
                  </Button>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>{ar ? 'آخر المعاملات' : 'Dernières transactions'}</CardTitle></CardHeader>
                <CardContent>
                  {transactions.length === 0 ? <p className="text-muted-foreground text-center py-6">{ar ? 'لا توجد معاملات' : 'Aucune transaction'}</p> : (
                    <div className="space-y-2">
                      {transactions.slice(0, 10).map(t => (
                        <div key={t.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                          <div>
                            <p className="font-medium">{t.description}</p>
                            <p className="text-xs text-muted-foreground">{(t.created_at || '').slice(0, 16).replace('T', ' ')}</p>
                          </div>
                          <span className={`font-bold ${t.type === 'DEPOSIT' || t.type === 'REFUND' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {t.type === 'DEPOSIT' || t.type === 'REFUND' ? '+' : '-'}{t.amount?.toLocaleString()} {ar ? 'دج' : 'DA'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Orders ── */}
          <TabsContent value="orders">
            <Card>
              <CardHeader><CardTitle>{ar ? 'طلباتي' : 'Mes commandes'}</CardTitle></CardHeader>
              <CardContent>
                {orders.length === 0 ? <p className="text-muted-foreground text-center py-8">{ar ? 'لا توجد طلبات' : 'Aucune commande'}</p> : (
                  <div className="space-y-2">
                    {orders.map(o => (
                      <div key={o.id} className="flex items-center justify-between border rounded-lg p-4">
                        <div>
                          <p className="font-medium">{o.product_name} <span className="text-xs text-muted-foreground">#{o.order_number}</span></p>
                          <p className="text-xs text-muted-foreground">{(o.created_at || '').slice(0, 16).replace('T', ' ')} — {o.amount?.toLocaleString()} {ar ? 'دج' : 'DA'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : o.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                            {o.status === 'COMPLETED' ? (ar ? 'مكتمل' : 'Terminée') : o.status === 'FAILED' ? (ar ? 'فشل' : 'Échouée') : (ar ? 'قيد الانتظار' : 'En attente')}
                          </Badge>
                          {o.status === 'COMPLETED' && (o.code_ids || []).length > 0 && (
                            <Button variant="outline" size="sm" onClick={() => viewOrderCodes(o)}>{ar ? 'عرض الكود' : 'Voir code'}</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Affiliate ── */}
          <TabsContent value="affiliate">
            <Card>
              <CardHeader><CardTitle>{ar ? 'برنامج الإحالة' : 'Programme d\'affiliation'}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {!affiliate ? (
                  <div className="text-center py-8">
                    <Share2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">{ar ? 'فعّل رابط الإحالة واربح عمولة عن كل عملية شراء' : 'Activez votre lien et gagnez des commissions'}</p>
                    <Button onClick={activateAffiliate} data-testid="activate-affiliate">{ar ? 'تفعيل رابط الإحالة' : 'Activer'}</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 border rounded-lg p-3 bg-muted/40">
                      <code className="flex-1 text-sm" dir="ltr">{window.location.origin}/digital-services?ref={affiliate.code}</code>
                      <Button variant="ghost" size="icon" onClick={() => copyText(`${window.location.origin}/digital-services?ref=${affiliate.code}`, 'aff')}>
                        {copied === 'aff' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="border rounded-lg p-4 text-center"><p className="text-2xl font-bold">{affiliate.total_clicks || 0}</p><p className="text-xs text-muted-foreground">{ar ? 'نقرات' : 'Clics'}</p></div>
                      <div className="border rounded-lg p-4 text-center"><p className="text-2xl font-bold">{affiliate.total_conversions || 0}</p><p className="text-xs text-muted-foreground">{ar ? 'تحويلات' : 'Conversions'}</p></div>
                      <div className="border rounded-lg p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{(affiliate.total_earnings || 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">{ar ? 'أرباح (دج)' : 'Gains (DA)'}</p></div>
                    </div>
                    <p className="text-sm text-muted-foreground">{ar ? `نسبة العمولة: ${affiliate.commission_rate}%` : `Commission: ${affiliate.commission_rate}%`}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Checkout Modal ── */}
        <Dialog open={!!checkoutProduct} onOpenChange={() => setCheckoutProduct(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{ar ? 'إتمام الشراء' : 'Finaliser l\'achat'}</DialogTitle></DialogHeader>
            {checkoutProduct && (
              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-muted/40">
                  <p className="font-semibold">{checkoutProduct.name}</p>
                  <p className="text-xl font-bold text-primary mt-1">{checkoutProduct.price?.toLocaleString()} {ar ? 'دج' : 'DA'}</p>
                </div>
                {(checkoutProduct.type === 'MOBILE_TOPUP' || checkoutProduct.type === 'INTERNET_BUNDLE' || checkoutProduct.delivery_method === 'DIRECT_TOPUP') && (
                  <div>
                    <Label>{ar ? 'رقم الهاتف المستهدف' : 'Numéro cible'}</Label>
                    <Input value={targetPhone} onChange={e => setTargetPhone(e.target.value)} dir="ltr" placeholder="05XXXXXXXX" className="mt-1" data-testid="target-phone" />
                  </div>
                )}
                <div>
                  <Label>{ar ? 'طريقة الدفع' : 'Paiement'}</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wallet">{ar ? `المحفظة (${(wallet?.balance ?? 0).toLocaleString()} دج)` : 'Portefeuille'}</SelectItem>
                      <SelectItem value="ccp">CCP</SelectItem>
                      <SelectItem value="d17">D17</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {payMethod === 'wallet' && (wallet?.balance ?? 0) < checkoutProduct.price && (
                  <p className="text-sm text-red-600">{ar ? 'رصيد المحفظة غير كافٍ — اشحن رصيدك أولاً' : 'Solde insuffisant'}</p>
                )}
                {payMethod !== 'wallet' && (
                  <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-amber-50">
                    {payMethod === 'ccp'
                      ? (ar ? 'حوّل المبلغ إلى حساب CCP ثم أرسل الوصل للإدارة لتأكيد طلبك.' : 'Virez le montant au compte CCP.')
                      : (ar ? 'ادفع عبر تطبيق D17 إلى الرقم المعتمد ثم أرسل لقطة شاشة للإدارة.' : 'Payez via D17.')}
                  </p>
                )}
                <Button className="w-full" onClick={buy} disabled={buying || (payMethod === 'wallet' && (wallet?.balance ?? 0) < checkoutProduct.price)} data-testid="confirm-buy">
                  {buying ? (ar ? 'جارٍ المعالجة...' : 'Traitement...') : (ar ? 'تأكيد الشراء' : 'Confirmer')}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Instant Delivery Modal ── */}
        <Dialog open={!!delivery} onOpenChange={() => setDelivery(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{ar ? 'تم التسليم الفوري ✅' : 'Livraison instantanée ✅'}</DialogTitle></DialogHeader>
            {delivery && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{delivery.product_name} — #{delivery.order_number}</p>
                {(delivery.codes || []).map((c, i) => (
                  <div key={i} className="border rounded-lg p-4 text-center space-y-3">
                    <div className="flex justify-center"><QRCodeSVG value={c.code} size={140} /></div>
                    <code className="block text-xl font-bold tracking-wider" dir="ltr">{c.code}</code>
                    {c.serial && <p className="text-xs text-muted-foreground" dir="ltr">SN: {c.serial}</p>}
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => copyText(c.code, `code-${i}`)}>
                        {copied === `code-${i}` ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        {ar ? 'نسخ' : 'Copier'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(c.code)}`, '_blank')}>
                        {ar ? 'واتساب' : 'WhatsApp'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(`sms:?body=${encodeURIComponent(c.code)}`, '_self')}>
                        SMS
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Deposit Modal ── */}
        <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{ar ? 'شحن الرصيد' : 'Recharger le solde'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{ar ? 'المبلغ (دج)' : 'Montant (DA)'}</Label>
                <Input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="mt-1" data-testid="deposit-amount" />
              </div>
              <Button className="w-full" onClick={deposit} disabled={!depositAmount || parseFloat(depositAmount) <= 0} data-testid="confirm-deposit">
                {ar ? 'تأكيد الشحن' : 'Confirmer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
