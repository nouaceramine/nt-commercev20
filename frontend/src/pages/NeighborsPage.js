// p335: إدارة الجيران B2B — حسابات محلات الجوار بأسعار خاصة وطلب بالدَّين أو كاش
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { errText } from '../lib/errorText';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Store, Plus, Trash2, RefreshCw, Pencil, HandCoins, ReceiptText, Link2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export default function NeighborsPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const ar = language === 'ar';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState(null); // {id?, name, phone, payment, discount_pct}
  const [stmt, setStmt] = useState(null); // {neighbor, data}
  const [settleAmt, setSettleAmt] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/restaurant/neighbors');
      setRows(Array.isArray(data) ? data : (data.neighbors || []));
    } catch (e) { toast.error(errText(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async () => {
    try {
      const body = {
        name: dlg.name.trim(),
        phone: dlg.phone || undefined,
        payment: dlg.payment,
        discount_pct: Number(dlg.discount_pct) || 0,
      };
      if (!body.name) { toast.error(ar ? 'الاسم مطلوب' : 'Nom requis'); return; }
      if (dlg.id) {
        await apiClient.put(`/restaurant/neighbors/${dlg.id}`, body);
        toast.success(ar ? 'تم التحديث' : 'Mis à jour');
      } else {
        await apiClient.post('/restaurant/neighbors', body);
        toast.success(ar ? 'تمت الإضافة' : 'Ajouté');
      }
      setDlg(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const remove = async (n) => {
    if (!window.confirm(ar ? `حذف «${n.name}»؟` : `Supprimer «${n.name}» ?`)) return;
    try {
      await apiClient.delete(`/restaurant/neighbors/${n.id}`);
      toast.success(ar ? 'تم الحذف' : 'Supprimé');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const openStatement = async (n) => {
    try {
      const { data } = await apiClient.get(`/restaurant/neighbors/${n.id}/statement`);
      setStmt({ neighbor: n, data });
      setSettleAmt('');
    } catch (e) { toast.error(errText(e)); }
  };

  const settle = async () => {
    const amount = Number(settleAmt);
    if (!amount || amount <= 0) { toast.error(ar ? 'مبلغ غير صالح' : 'Montant invalide'); return; }
    try {
      await apiClient.post(`/restaurant/neighbors/${stmt.neighbor.id}/settle`, { amount });
      toast.success(ar ? 'سُجّل التسديد' : 'Règlement enregistré');
      openStatement(stmt.neighbor);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const publicLink = (n) => `${window.location.origin}/b2b/${user?.tenant_id || ''}/${n.token}`;

  const copyLink = (n) => {
    const link = publicLink(n);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => toast.success(ar ? 'نُسخ الرابط' : 'Lien copié'));
    } else {
      window.prompt(ar ? 'انسخ الرابط:' : 'Copiez le lien :', link);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4" dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Store className="w-6 h-6" />
            {ar ? 'الجيران B2B' : 'Voisins B2B'}
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} data-testid="nbr-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" data-testid="nbr-add"
              onClick={() => setDlg({ name: '', phone: '', payment: 'debt', discount_pct: 0 })}>
              <Plus className="w-4 h-4 ml-1" />{ar ? 'محل جار' : 'Ajouter'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {ar
            ? 'أنشئ حسابًا لكل محل مجاور، وشاركه رابط الطلب الخاص — يطلب عماله بأسعار خاصة، والدفع دَينًا (يُسوّيه المدير) أو كاش.'
            : 'Créez un compte par commerce voisin et partagez le lien de commande — prix spéciaux, paiement à crédit ou cash.'}
        </p>

        {loading ? (
          <p className="text-center text-muted-foreground py-10">{ar ? 'جارٍ التحميل…' : 'Chargement…'}</p>
        ) : rows.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground" data-testid="nbr-empty">
            {ar ? 'لا يوجد جيران بعد — أضف أول محل' : 'Aucun voisin — ajoutez le premier'}
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((n) => (
              <Card key={n.id} data-testid={`nbr-card-${n.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{n.name}</div>
                    <Badge variant={n.payment === 'debt' ? 'destructive' : 'secondary'} data-testid={`nbr-payment-${n.id}`}>
                      {n.payment === 'debt' ? (ar ? 'دَين' : 'Crédit') : (ar ? 'كاش' : 'Cash')}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4">
                    {n.phone && <span>{n.phone}</span>}
                    {Number(n.discount_pct) > 0 && <span>{ar ? 'تخفيض' : 'Remise'} {n.discount_pct}%</span>}
                    <span>{ar ? 'الرصيد' : 'Solde'}: <b data-testid={`nbr-balance-${n.id}`}>{Number(n.balance || 0).toLocaleString()}</b></span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => copyLink(n)} data-testid={`nbr-copy-${n.id}`}>
                      <Link2 className="w-3.5 h-3.5 ml-1" />{ar ? 'رابط الطلب' : 'Lien'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openStatement(n)} data-testid={`nbr-stmt-${n.id}`}>
                      <ReceiptText className="w-3.5 h-3.5 ml-1" />{ar ? 'الكشف' : 'Relevé'}
                    </Button>
                    <Button variant="outline" size="sm" data-testid={`nbr-edit-${n.id}`}
                      onClick={() => setDlg({ id: n.id, name: n.name, phone: n.phone || '', payment: n.payment || 'debt', discount_pct: n.discount_pct || 0 })}>
                      <Pencil className="w-3.5 h-3.5 ml-1" />{ar ? 'تعديل' : 'Modifier'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(n)} data-testid={`nbr-del-${n.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* create / edit dialog */}
        <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
          <DialogContent dir={ar ? 'rtl' : 'ltr'}>
            <DialogHeader>
              <DialogTitle>{dlg?.id ? (ar ? 'تعديل محل' : 'Modifier') : (ar ? 'محل جار جديد' : 'Nouveau voisin')}</DialogTitle>
            </DialogHeader>
            {dlg && (
              <div className="space-y-3">
                <Input placeholder={ar ? 'اسم المحل' : 'Nom du commerce'} value={dlg.name}
                  onChange={(e) => setDlg({ ...dlg, name: e.target.value })} data-testid="nbr-name" />
                <Input placeholder={ar ? 'هاتف (اختياري)' : 'Téléphone (optionnel)'} value={dlg.phone}
                  onChange={(e) => setDlg({ ...dlg, phone: e.target.value })} data-testid="nbr-phone" />
                <div className="flex items-center gap-2">
                  <span className="text-sm">{ar ? 'الدفع:' : 'Paiement :'}</span>
                  <Select value={dlg.payment} onValueChange={(v) => setDlg({ ...dlg, payment: v })}>
                    <SelectTrigger className="w-40" data-testid="nbr-payment-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debt">{ar ? 'دَين (يُسوّيه المدير)' : 'Crédit'}</SelectItem>
                      <SelectItem value="cash">{ar ? 'كاش عند الاستلام' : 'Cash'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{ar ? 'تخفيض عام %:' : 'Remise % :'}</span>
                  <Input type="number" min="0" max="90" className="w-24" value={dlg.discount_pct}
                    onChange={(e) => setDlg({ ...dlg, discount_pct: e.target.value })} data-testid="nbr-discount" />
                </div>
                <Button className="w-full" onClick={save} data-testid="nbr-save">
                  {ar ? 'حفظ' : 'Enregistrer'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* statement dialog */}
        <Dialog open={!!stmt} onOpenChange={(o) => !o && setStmt(null)}>
          <DialogContent dir={ar ? 'rtl' : 'ltr'} className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{ar ? 'كشف حساب' : 'Relevé'} — {stmt?.neighbor?.name}</DialogTitle>
            </DialogHeader>
            {stmt && (
              <div className="space-y-3" data-testid="nbr-statement">
                <div className="flex justify-between text-sm">
                  <span>{ar ? 'إجمالي الطلبات' : 'Total commandes'}: <b>{Number(stmt.data.total_orders || 0).toLocaleString()}</b></span>
                  <span>{ar ? 'إجمالي التسديدات' : 'Total règlements'}: <b>{Number(stmt.data.total_settlements || 0).toLocaleString()}</b></span>
                  <span>{ar ? 'الرصيد' : 'Solde'}: <b className="text-red-600" data-testid="nbr-stmt-balance">{Number(stmt.data.balance || 0).toLocaleString()}</b></span>
                </div>
                <div className="max-h-56 overflow-auto border rounded">
                  {(stmt.data.orders || []).length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">{ar ? 'لا طلبات' : 'Aucune commande'}</p>
                  ) : (stmt.data.orders || []).map((o) => (
                    <div key={o.id} className="flex justify-between px-3 py-2 text-sm border-b last:border-0">
                      <span>{o.code || o.id}</span>
                      <span>{Number(o.total || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input type="number" min="1" placeholder={ar ? 'مبلغ التسديد' : 'Montant'} value={settleAmt}
                    onChange={(e) => setSettleAmt(e.target.value)} data-testid="nbr-settle-amount" />
                  <Button onClick={settle} data-testid="nbr-settle-btn">
                    <HandCoins className="w-4 h-4 ml-1" />{ar ? 'تسديد' : 'Régler'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
