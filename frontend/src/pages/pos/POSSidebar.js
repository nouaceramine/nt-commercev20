import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Package, ArrowUp, ArrowDown, FolderTree, UserPlus, Printer, CalendarDays, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import CameraBarcodeScanner from '../../components/forms/CameraBarcodeScanner';
import SaleDetailDialog from '../../components/sales/SaleDetailDialog';
import apiClient from '../../lib/apiClient';

/**
 * p177: لوحة مهام البيع — نافذة داخلية ثابتة الارتفاع بأسهم تمرير ▲▼
 * المهام (منتجات/عائلات/زبائن/تقارير/سجل) تظهر داخل اللوحة نفسها بدل النوافذ المنبثقة.
 */
export default function POSSidebar({
  searchInputRef, searchQuery, setSearchQuery,
  showSearchResults, setShowSearchResults, searchResults,
  products, addToCart, setShowProductsDialog,
  taskMenuItems, activeTask, handleTaskClick, returnMode,
  language, formatCurrency, isRTL,
  inlineTask, setInlineTask,
  families = [], customers = [], customerFamilies = [],
  selectedCustomer, setSelectedCustomer,
  salesHistory = [], historyLoading = false,
  currentSession, sessionStats,
  printThermalReceipt, thermalSize = '80mm',
  lastSaleId, debtsMap = {}, onProductUpdated,
}) {
  const ar = language === 'ar';
  const listRef = useRef(null);
  const [inlineFamilyId, setInlineFamilyId] = useState(null);   // drill into a product family
  const [prodSearch, setProdSearch] = useState('');             // filter inside articles list
  const [custSearch, setCustSearch] = useState('');             // filter inside customers list
  const [activeCustFam, setActiveCustFam] = useState(null);     // customer family chip
  const [detailSaleId, setDetailSaleId] = useState(null);       // history → sale detail
  // p179: السجل بفلسفة R.Lynx — فترات → معاملات → وصل
  const [histStage, setHistStage] = useState('periods');        // periods | custom | list | receipt
  const [histPeriodLabel, setHistPeriodLabel] = useState('');
  const [histSales, setHistSales] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histSearch, setHistSearch] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [receiptSale, setReceiptSale] = useState(null);
  const [editProduct, setEditProduct] = useState(null);        // p180: quick-edit dialog
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // p180: «طباعة آخر فاتورة» — تحميل آخر وصل وعرضه داخل اللوحة
  useEffect(() => {
    if (inlineTask === 'lastreceipt' && lastSaleId) {
      apiClient.get(`/sales/${lastSaleId}`)
        .then(r => setReceiptSale(r.data))
        .catch(() => toast.error(ar ? 'فشل فتح الوصل' : 'Échec'));
    }
  }, [inlineTask, lastSaleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // reset sub-state when switching tasks
  useEffect(() => {
    setInlineFamilyId(null); setProdSearch(''); setCustSearch(''); setActiveCustFam(null);
    setHistStage('periods'); setHistSales([]); setHistSearch(''); setReceiptSale(null); setHistFrom(''); setHistTo('');
    listRef.current?.scrollTo({ top: 0 });
  }, [inlineTask]);

  const scrollList = (dir) => listRef.current?.scrollBy({ top: dir * 280, behavior: 'smooth' });

  // p149: مسح الباركود بالكاميرا — نفس منطق الماسح الفعلي: تطابق تام يضيف للسلة، وإلا نعبّئ البحث
  const handleCameraScan = (code) => {
    const product = products.find(p =>
      p.barcode === code ||
      (Array.isArray(p.additional_barcodes) && p.additional_barcodes.includes(code)) ||
      p.article_code === code ||
      p.code === code
    );
    if (product) {
      addToCart(product);
      toast.success(`${product.name_ar || product.name_en || product.name}`);
    } else {
      setSearchQuery(code);
      setShowSearchResults(true);
      toast.error(language === 'ar' ? `المنتج غير موجود: ${code}` : `Produit introuvable : ${code}`);
    }
  };

  const searching = searchQuery.trim().length >= 1;

  const TASK_TITLES = {
    'articles': ar ? 'قائمة المنتجات' : 'Liste articles',
    'families': ar ? 'المنتجات بالعائلة' : 'Par famille',
    'customers': ar ? 'الزبائن' : 'Clients',
    'customer-families': ar ? 'عائلات الزبائن' : 'Familles clients',
    'reports': ar ? 'تقارير الحصة' : 'Rapports session',
    'history': ar ? 'السجل' : 'Historique',
    'lastreceipt': ar ? 'آخر فاتورة' : 'Derniere facture',
  };

  // product row shared by search results / articles / families views
  const ProductRow = ({ product, testid }) => (
    <button
      key={product.id}
      onClick={() => {
        addToCart(product);
        toast.success(ar ? `أُضيف: ${product.name_ar || product.name_en}` : `Ajouté: ${product.name_en || product.name_ar}`);
      }}
      className="w-full flex items-center gap-2 p-2.5 rounded-lg border hover:border-primary hover:bg-primary/5 text-start transition-colors"
      data-testid={testid}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight">{ar ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{product.article_code || product.barcode || ''}</p>
        <p className="text-sm font-bold text-primary mt-0.5">{formatCurrency(product.retail_price)}</p>
      </div>
      <Badge variant={(product.quantity || 0) > 0 ? 'secondary' : 'destructive'} className="text-xs shrink-0">
        {product.quantity || 0}
      </Badge>
      {/* p180: اختصار تعديل المنتج — على كل منتج */}
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); setEditProduct(product); setEditForm({
          name_ar: product.name_ar || '', barcode: product.barcode || '',
          retail_price: product.retail_price ?? 0, wholesale_price: product.wholesale_price ?? 0,
          purchase_price: product.purchase_price ?? 0, quantity: product.quantity ?? 0,
        }); }}
        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
        title={ar ? 'تعديل المنتج' : 'Modifier'}
        data-testid={`edit-product-${product.id}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </span>
    </button>
  );

  // p180: حفظ التعديل السريع
  const saveQuickEdit = async () => {
    if (!editProduct) return;
    setEditSaving(true);
    try {
      const payload = {
        name_ar: editForm.name_ar, barcode: editForm.barcode,
        retail_price: parseFloat(editForm.retail_price) || 0,
        wholesale_price: parseFloat(editForm.wholesale_price) || 0,
        purchase_price: parseFloat(editForm.purchase_price) || 0,
        quantity: parseFloat(editForm.quantity) || 0,
      };
      await apiClient.put(`/products/${editProduct.id}`, payload);
      if (onProductUpdated) onProductUpdated({ ...editProduct, ...payload });
      toast.success(ar ? 'تم حفظ التعديل' : 'Modifié');
      setEditProduct(null);
    } catch { toast.error(ar ? 'فشل الحفظ' : 'Échec'); }
    finally { setEditSaving(false); }
  };

  const filteredInlineProducts = products.filter(p => {
    const q = prodSearch.toLowerCase();
    return !q || p.name_ar?.toLowerCase().includes(q) || p.name_en?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) || p.article_code?.toLowerCase().includes(q);
  });

  const filteredCustomers = customers.filter(c => {
    const q = custSearch.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
    const matchFamily = !activeCustFam || c.family_id === activeCustFam;
    return matchSearch && matchFamily;
  });

  const pickCustomer = (c) => {
    setSelectedCustomer(c.id);
    toast.success(ar ? `الزبون: ${c.name}` : `Client : ${c.name}`);
  };

  const CustomerRow = ({ c }) => {
    const debt = debtsMap[c.id] || 0;                 // p180: ديون الزبون
    const points = c.loyalty_points || 0;             // p180: نقاط الولاء
    return (
      <button
        key={c.id}
        onClick={() => pickCustomer(c)}
        className={`w-full p-2.5 rounded-lg border text-start flex items-center justify-between gap-2 transition-colors hover:border-primary hover:bg-primary/5 ${selectedCustomer === c.id ? 'border-primary bg-primary/10' : ''}`}
        data-testid={`inline-customer-${c.id}`}
      >
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.phone}</p>
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {debt > 0 && (
              <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 rounded-full px-1.5 py-0.5" data-testid={`cust-debt-${c.id}`}>
                {ar ? 'دين' : 'Dette'}: {formatCurrency(debt)}
              </span>
            )}
            {points > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded-full px-1.5 py-0.5" data-testid={`cust-points-${c.id}`}>
                ⭐ {points}
              </span>
            )}
          </div>
        </div>
        {c.family_name && (
          <span className="text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 shrink-0">{c.family_name}</span>
        )}
      </button>
    );
  };

  // p179: فترات السجل — R.Lynx style
  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayEnd = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  const HIST_PERIODS = [
    { key: 'today',       label: ar ? 'اليوم' : "Aujourd'hui" },
    { key: 'yesterday',   label: ar ? 'أمس' : 'Hier' },
    { key: 'week',        label: ar ? 'هذا الأسبوع' : 'Cette semaine' },
    { key: 'last7',       label: ar ? 'آخر 7 أيام' : '7 derniers jours' },
    { key: 'last15',      label: ar ? 'آخر 15 يوماً' : '15 derniers jours' },
    { key: 'month',       label: ar ? 'هذا الشهر' : 'Ce mois' },
    { key: 'last30',      label: ar ? 'آخر 30 يوماً' : '30 derniers jours' },
    { key: 'session',     label: ar ? 'الحصة الحالية' : 'Session en cours' },
    { key: 'lastsession', label: ar ? 'آخر حصة مغلقة' : 'Dernière session clôturée' },
    { key: 'custom',      label: ar ? 'بفترة مخصصة...' : 'Par période...' },
  ];

  const loadSalesRange = async (from, to, label) => {
    setHistLoading(true); setHistSales([]); setHistStage('list'); setHistPeriodLabel(label); setHistSearch('');
    try {
      let url = '/sales?';
      if (from) url += `start_date=${encodeURIComponent(from.toISOString())}&`;
      if (to) url += `end_date=${encodeURIComponent(to.toISOString())}`;
      const res = await apiClient.get(url);
      setHistSales(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error(ar ? 'فشل تحميل السجل' : 'Échec du chargement'); }
    finally { setHistLoading(false); }
  };

  const pickPeriod = async (key, label) => {
    const now = new Date();
    if (key === 'custom') { setHistStage('custom'); return; }
    if (key === 'session') {
      if (!currentSession) { toast.info(ar ? 'لا توجد حصة مفتوحة' : 'Aucune session ouverte'); return; }
      return loadSalesRange(new Date(currentSession.opened_at), null, label);
    }
    if (key === 'lastsession') {
      try {
        const res = await apiClient.get('/daily-sessions');
        const closed = (Array.isArray(res.data) ? res.data : []).find(x => x.status === 'closed');
        if (!closed) { toast.info(ar ? 'لا توجد حصة مغلقة' : 'Aucune session clôturée'); return; }
        return loadSalesRange(new Date(closed.opened_at), closed.closed_at ? new Date(closed.closed_at) : null, label);
      } catch { toast.error(ar ? 'فشل' : 'Échec'); return; }
    }
    const d = dayStart(now);
    if (key === 'today') return loadSalesRange(d, dayEnd(now), label);
    if (key === 'yesterday') { const y = dayStart(now); y.setDate(y.getDate() - 1); return loadSalesRange(y, dayEnd(y), label); }
    if (key === 'week') { const w = dayStart(now); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); return loadSalesRange(w, dayEnd(now), label); }
    if (key === 'last7') { d.setDate(d.getDate() - 6); return loadSalesRange(d, dayEnd(now), label); }
    if (key === 'last15') { d.setDate(d.getDate() - 14); return loadSalesRange(d, dayEnd(now), label); }
    if (key === 'month') return loadSalesRange(new Date(now.getFullYear(), now.getMonth(), 1), dayEnd(now), label);
    if (key === 'last30') { d.setDate(d.getDate() - 29); return loadSalesRange(d, dayEnd(now), label); }
  };

  const openReceipt = async (saleId) => {
    try {
      const res = await apiClient.get(`/sales/${saleId}`);
      setReceiptSale(res.data); setHistStage('receipt');
      listRef.current?.scrollTo({ top: 0 });
    } catch { toast.error(ar ? 'فشل فتح الوصل' : 'Échec'); }
  };

  const histBack = () => {
    if (histStage === 'receipt') { setReceiptSale(null); setHistStage('list'); }
    else if (histStage === 'list' || histStage === 'custom') setHistStage('periods');
  };

  // p180: عرض الوصل داخل اللوحة — مشترك بين السجل و«طباعة آخر فاتورة»
  const renderReceipt = (sale) => (
    <div className="space-y-1" data-testid="hist-receipt-view">
      <div className="border rounded-lg p-2 bg-muted/30 text-center">
        <p className="font-mono text-xs font-bold">{sale.invoice_number || sale.code}</p>
        <p className="text-[10px] text-muted-foreground">
          {new Date(sale.created_at).toLocaleDateString(ar ? 'ar-DZ' : 'fr-FR')} | {new Date(sale.created_at).toLocaleTimeString(ar ? 'ar-DZ' : 'fr-FR')}
        </p>
        <p className="text-xs font-bold mt-0.5">{sale.customer_name || (ar ? 'زبون عابر' : 'Client passant')}</p>
      </div>
      <div className="border rounded-lg overflow-hidden">
        {(sale.items || []).map((it, idx) => (
          <div key={idx} className="px-2 py-1 border-b last:border-b-0 text-xs">
            <p className="font-medium leading-tight">{it.product_name}</p>
            <div className="flex justify-between text-muted-foreground mt-0.5">
              <span>{it.quantity} × {formatCurrency(it.unit_price)}</span>
              <span className="font-semibold text-foreground">{formatCurrency(it.total ?? (it.quantity * it.unit_price))}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="border rounded-lg p-2 text-xs space-y-0.5">
        <div className="flex justify-between"><span className="text-muted-foreground">{ar ? 'المجموع الفرعي' : 'Sous-total'}</span><span>{formatCurrency(sale.subtotal || 0)}</span></div>
        {(sale.discount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{ar ? 'التخفيض' : 'Remise'}</span><span>-{formatCurrency(sale.discount)}</span></div>}
        {(sale.delivery_fee || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{ar ? 'التوصيل' : 'Livraison'}</span><span>{formatCurrency(sale.delivery_fee)}</span></div>}
        <div className="flex justify-between font-bold text-sm pt-0.5 border-t"><span>{ar ? 'الإجمالي' : 'Total'}</span><span className="text-primary">{formatCurrency(sale.total || 0)}</span></div>
      </div>
      <Button size="sm" className="w-full h-8 gap-1.5 text-xs" data-testid="hist-print-btn"
        onClick={() => printThermalReceipt && printThermalReceipt(sale.id, thermalSize)}>
        <Printer className="h-3.5 w-3.5" />{ar ? 'طباعة' : 'Imprimer'}
      </Button>
    </div>
  );

  // ===== inline task contents =====
  const renderInlineTask = () => {
    switch (inlineTask) {
      case 'articles':
        return (
          <div className="space-y-1" data-testid="inline-articles-list">
            <Input
              value={prodSearch}
              onChange={e => setProdSearch(e.target.value)}
              placeholder={ar ? 'تصفية المنتجات...' : 'Filtrer...'}
              className="h-8 text-xs mb-1"
              data-testid="inline-articles-search"
            />
            {filteredInlineProducts.map(p => <ProductRow key={p.id} product={p} testid={`inline-product-${p.id}`} />)}
            {filteredInlineProducts.length === 0 && (
              <p className="p-3 text-center text-muted-foreground text-sm">{ar ? 'لا توجد نتائج' : 'Aucun résultat'}</p>
            )}
          </div>
        );

      case 'families':
        if (!inlineFamilyId) {
          return (
            <div className="space-y-1" data-testid="inline-families-list">
              {families.map(f => (
                <button
                  key={f.id}
                  onClick={() => setInlineFamilyId(f.id)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg border hover:border-primary hover:bg-primary/5 text-start transition-colors"
                  data-testid={`inline-family-${f.id}`}
                >
                  <FolderTree className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1 text-sm font-medium truncate">{f.name_ar || f.name}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {products.filter(p => p.family_id === f.id).length}
                  </Badge>
                </button>
              ))}
              {families.length === 0 && (
                <p className="p-3 text-center text-muted-foreground text-sm">{ar ? 'لا توجد عائلات' : 'Aucune famille'}</p>
              )}
            </div>
          );
        }
        return (
          <div className="space-y-1" data-testid="inline-family-products">
            <button
              onClick={() => setInlineFamilyId(null)}
              className="text-xs text-primary hover:underline mb-1"
              data-testid="inline-family-back"
            >
              {ar ? '→ كل العائلات' : '← Toutes les familles'}
            </button>
            {products.filter(p => p.family_id === inlineFamilyId).map(p => <ProductRow key={p.id} product={p} testid={`inline-product-${p.id}`} />)}
            {products.filter(p => p.family_id === inlineFamilyId).length === 0 && (
              <p className="p-3 text-center text-muted-foreground text-sm">{ar ? 'لا منتجات في هذه العائلة' : 'Aucun produit'}</p>
            )}
          </div>
        );

      case 'customers':
      case 'customer-families':
        return (
          <div className="space-y-1" data-testid="inline-customers-list">
            <Input
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
              placeholder={ar ? 'بحث بالاسم أو الهاتف...' : 'Nom ou tél...'}
              className="h-8 text-xs mb-1"
              data-testid="inline-customers-search"
            />
            {inlineTask === 'customer-families' && customerFamilies.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-1">
                <button
                  onClick={() => setActiveCustFam(null)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${activeCustFam === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}
                >
                  {ar ? 'الكل' : 'Tout'}
                </button>
                {customerFamilies.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setActiveCustFam(activeCustFam === f.id ? null : f.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors max-w-[90px] truncate ${activeCustFam === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}
                    title={f.name}
                    data-testid={`inline-custfam-${f.id}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            {filteredCustomers.map(c => <CustomerRow key={c.id} c={c} />)}
            {filteredCustomers.length === 0 && (
              <p className="p-3 text-center text-muted-foreground text-sm">{ar ? 'لا توجد نتائج' : 'Aucun résultat'}</p>
            )}
          </div>
        );

      case 'reports':
        if (!sessionStats || !currentSession) {
          return <p className="py-8 text-center text-muted-foreground text-sm">{ar ? 'لا توجد حصة مفتوحة' : 'Aucune session ouverte'}</p>;
        }
        return (
          <div className="space-y-2 p-1" data-testid="inline-reports">
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-xs">
              <span className="text-muted-foreground">{ar ? 'الحصة' : 'Session'}</span>
              <div className="text-end">
                <p className="font-mono font-bold">{currentSession.code || '—'}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(currentSession.opened_at).toLocaleTimeString(ar ? 'ar-DZ' : 'fr-FR')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: ar ? 'المبيعات النقدية' : 'Espèces', val: sessionStats.cashSales },
                { label: ar ? 'البيع بالدين' : 'Crédit', val: sessionStats.creditSales },
                { label: ar ? 'إجمالي المبيعات' : 'Total', val: sessionStats.totalSales },
                { label: ar ? 'عدد الفواتير' : 'Nb ventes', count: sessionStats.salesCount },
              ].map(st => (
                <div key={st.label} className="p-2 bg-muted/40 rounded-lg text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{st.label}</p>
                  <p className="text-sm font-bold text-primary">
                    {st.count !== undefined ? st.count : formatCurrency(st.val)}
                  </p>
                </div>
              ))}
            </div>
            <div className="p-2 bg-primary/5 rounded-lg flex justify-between items-center text-xs">
              <span className="font-medium">{ar ? 'المتوقع في الصندوق' : 'Attendu en caisse'}</span>
              <span className="font-bold text-primary">{formatCurrency((currentSession.opening_cash || 0) + (sessionStats.cashSales || 0))}</span>
            </div>
          </div>
        );

      case 'history': {
        const q = histSearch.toLowerCase();
        const shown = histSales.filter(sale =>
          !q || (sale.customer_name || '').toLowerCase().includes(q) ||
          (sale.invoice_number || '').toLowerCase().includes(q) || (sale.code || '').toLowerCase().includes(q)
        );

        // — المستوى 1: قائمة الفترات
        if (histStage === 'periods') {
          return (
            <div className="space-y-0.5" data-testid="hist-periods-list">
              {HIST_PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => pickPeriod(p.key, p.label)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
                  data-testid={`hist-period-${p.key}`}
                >
                  <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1 text-start">{p.label}</span>
                </button>
              ))}
            </div>
          );
        }

        // — المستوى 2: فترة مخصصة (من / إلى)
        if (histStage === 'custom') {
          return (
            <div className="space-y-2 p-1" data-testid="hist-custom-range">
              <div>
                <label className="text-[10px] text-muted-foreground">{ar ? 'من:' : 'Entre:'}</label>
                <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 text-xs border rounded-md bg-background" data-testid="hist-from-date" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{ar ? 'إلى:' : 'Et:'}</label>
                <input type="date" value={histTo} onChange={e => setHistTo(e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 text-xs border rounded-md bg-background" data-testid="hist-to-date" />
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 h-8 text-xs" data-testid="hist-custom-ok"
                  disabled={!histFrom || !histTo}
                  onClick={() => loadSalesRange(dayStart(new Date(histFrom)), dayEnd(new Date(histTo)), `${histFrom} ← ${histTo}`)}>
                  {ar ? 'تأكيد' : 'Ok'}
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setHistStage('periods')} data-testid="hist-custom-cancel">
                  {ar ? 'إلغاء' : 'Annuler'}
                </Button>
              </div>
            </div>
          );
        }

        // — المستوى 4: معاينة الوصل داخل اللوحة (العرض المشترك p180)
        if (histStage === 'receipt' && receiptSale) {
          return renderReceipt(receiptSale);
        }

        // — المستوى 3: قائمة المعاملات بخانة بحث
        return (
          <div className="space-y-1" data-testid="inline-history-list">
            <Input
              value={histSearch}
              onChange={e => setHistSearch(e.target.value)}
              placeholder={ar ? 'بحث في المعاملات...' : 'Rechercher transaction...'}
              className="h-8 text-xs mb-1"
              data-testid="hist-search-input"
            />
            {histLoading ? (
              <p className="p-6 text-center text-muted-foreground text-sm">{ar ? 'جاري التحميل...' : 'Chargement...'}</p>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground text-sm">{ar ? 'لا معاملات في هذه الفترة' : 'Aucune transaction'}</p>
            ) : shown.map(sale => (
              <button
                key={sale.id}
                onClick={() => openReceipt(sale.id)}
                className="w-full p-2 rounded-lg border hover:border-primary hover:bg-primary/5 text-start transition-colors"
                data-testid={`hist-sale-${sale.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs truncate">{sale.customer_name || (ar ? 'زبون عابر' : 'Client passant')}</span>
                  <span className="text-xs font-bold text-primary shrink-0">{formatCurrency(sale.total)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="font-mono text-[10px] text-muted-foreground">{sale.invoice_number || sale.code}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(sale.created_at).toLocaleDateString(ar ? 'ar-DZ' : 'fr-FR')} | {new Date(sale.created_at).toLocaleTimeString(ar ? 'ar-DZ' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        );
      }

      case 'lastreceipt':  // p180: طباعة آخر فاتورة — تعرض الوصل أولاً
        if (!receiptSale) {
          return <p className="py-8 text-center text-muted-foreground text-sm">{ar ? 'جاري التحميل...' : 'Chargement...'}</p>;
        }
        return renderReceipt(receiptSale);

      default:
        return null;
    }
  };

  return (
    <div className="hidden md:flex md:col-span-3 flex-col gap-2 min-h-0" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Card className="p-2 shrink-0">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-5 w-5 text-muted-foreground z-10" />
          <Input
            ref={searchInputRef}
            placeholder={language === 'ar' ? 'بحث أو مسح باركود...' : 'Rechercher ou scanner...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowSearchResults(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                e.preventDefault();
                const q = searchQuery.trim();
                const product = products.find(p =>
                  p.barcode === q ||
                  (Array.isArray(p.additional_barcodes) && p.additional_barcodes.includes(q)) ||
                  p.code === q ||
                  p.code?.toLowerCase() === q.toLowerCase()
                );
                if (product) {
                  addToCart(product);
                  setSearchQuery('');
                  setShowSearchResults(false);
                } else if (searchResults.length === 1) {
                  addToCart(searchResults[0]);
                  setSearchQuery('');
                  setShowSearchResults(false);
                }
              }
            }}
            className="ps-11 h-14 text-base font-medium"
            data-testid="pos-search-input"
          />
          <span className="absolute top-1/2 -translate-y-1/2 end-2 z-10">
            <CameraBarcodeScanner language={language} onDetected={handleCameraScan} testId="pos-camera-scan-btn" />
          </span>
        </div>
      </Card>

      {/* p177: نافذة ثابتة الارتفاع — المحتوى يتمرر داخلها فقط ولا يمدّد الصفحة */}
      <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
        <CardHeader className="p-2 pb-1 shrink-0">
          <div className="flex items-center justify-between gap-1">
            {searching ? (
              <CardTitle className="text-xs font-medium text-primary flex items-center justify-between flex-1" data-testid="pos-search-results-title">
                <span>{language === 'ar' ? `نتائج البحث (${searchResults.length})` : `Résultats (${searchResults.length})`}</span>
                <button
                  onClick={() => { setSearchQuery(''); setShowSearchResults(false); }}
                  className="text-muted-foreground hover:text-foreground text-sm px-1"
                  title={language === 'ar' ? 'مسح البحث' : 'Effacer'}
                  data-testid="pos-search-clear-btn"
                >✕</button>
              </CardTitle>
            ) : inlineTask ? (
              <CardTitle className="text-xs font-medium text-primary flex items-center gap-1 flex-1" data-testid="inline-task-title">
                <button
                  onClick={() => { if (inlineTask === 'history' && histStage !== 'periods') histBack(); else setInlineTask(null); }}
                  className="text-muted-foreground hover:text-foreground px-1 text-sm"
                  title={ar ? 'رجوع' : 'Retour'}
                  data-testid="inline-task-back-btn"
                >
                  {ar ? '→' : '←'}
                </button>
                <span>{TASK_TITLES[inlineTask] || ''}{inlineTask === 'history' && histPeriodLabel && histStage !== 'periods' ? ` | ${histPeriodLabel}` : ''}</span>
              </CardTitle>
            ) : (
              <CardTitle className="text-xs font-medium text-muted-foreground flex-1">
                {language === 'ar' ? 'مهام البيع' : 'Taches'}
              </CardTitle>
            )}
            {/* p177: سهما التمرير ▲▼ */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => scrollList(-1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title={ar ? 'للأعلى' : 'Haut'}
                data-testid="sidebar-scroll-up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => scrollList(1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title={ar ? 'للأسفل' : 'Bas'}
                data-testid="sidebar-scroll-down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-1 pt-0 overflow-y-auto flex-1 min-h-0" ref={listRef}>
          {searching ? (
            /* p163: search results fill the sidebar as large clear product cards — one tap adds to cart */
            <div className="space-y-1" data-testid="pos-search-results-list">
              {searchResults.length === 0 ? (
                <div className="p-3 text-center text-muted-foreground text-sm">
                  <p className="mb-2">{language === 'ar' ? 'لا توجد نتائج' : 'Aucun résultat'}</p>
                  <a
                    href="/products"
                    className="inline-flex items-center gap-1 text-xs text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/10 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {language === 'ar' ? `إنشاء منتج "${searchQuery}"` : `Créer "${searchQuery}"`}
                  </a>
                </div>
              ) : (
                searchResults.map((product) => (
                  <ProductRow key={product.id} product={product} testid={`pos-search-result-${product.id}`} />
                ))
              )}
            </div>
          ) : inlineTask ? (
            renderInlineTask()
          ) : (
          <div className="space-y-0.5">
            {taskMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleTaskClick(item.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                  activeTask === item.id
                    ? 'bg-primary text-primary-foreground'
                    : item.id === 'return' && returnMode
                      ? 'bg-destructive text-destructive-foreground'
                      : item.highlight
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={item.label}
                data-testid={`task-${item.id}`}
              >
                <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex-1 text-start truncate">{item.label}</span>
                <span className="text-[10px] opacity-60">{item.shortcut}</span>
              </button>
            ))}
          </div>
          )}
        </CardContent>
      </Card>

      {/* p180: نافذة التعديل السريع على المنتج */}
      {editProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditProduct(null)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm p-4 space-y-2" onClick={e => e.stopPropagation()} data-testid="quick-edit-dialog">
            <p className="font-bold text-sm">{ar ? 'تعديل سريع: ' : 'Modifier : '}{editProduct.name_ar || editProduct.name_en}</p>
            {[
              { k: 'name_ar', label: ar ? 'الاسم' : 'Nom', type: 'text' },
              { k: 'barcode', label: ar ? 'الباركود' : 'Code-barres', type: 'text' },
              { k: 'retail_price', label: ar ? 'سعر التجزئة' : 'Prix detail', type: 'number' },
              { k: 'wholesale_price', label: ar ? 'سعر الجملة' : 'Prix gros', type: 'number' },
              { k: 'purchase_price', label: ar ? 'سعر الشراء' : 'Prix achat', type: 'number' },
              { k: 'quantity', label: ar ? 'الكمية' : 'Quantité', type: 'number' },
            ].map(f => (
              <div key={f.k} className="flex items-center gap-2">
                <label className="w-24 text-xs text-muted-foreground shrink-0">{f.label}</label>
                <Input
                  type={f.type}
                  value={editForm[f.k] ?? ''}
                  onChange={e => setEditForm(prev => ({ ...prev, [f.k]: e.target.value }))}
                  className="h-8 text-sm"
                  data-testid={`quick-edit-${f.k}`}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => setEditProduct(null)}>{ar ? 'إلغاء' : 'Annuler'}</Button>
              <Button className="flex-1 h-8 text-xs" onClick={saveQuickEdit} disabled={editSaving} data-testid="quick-edit-save">
                {ar ? 'حفظ' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* p177: تفاصيل فاتورة من السجل الداخلي */}
      <SaleDetailDialog
        saleId={detailSaleId}
        open={!!detailSaleId}
        onOpenChange={(v) => !v && setDetailSaleId(null)}
        language={language} formatCurrency={formatCurrency} customers={customers}
      />
    </div>
  );
}
