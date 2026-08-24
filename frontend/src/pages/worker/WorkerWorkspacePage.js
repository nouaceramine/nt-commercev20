// p293 — مساحة عمل العامل: طابور تأكيد الطلبات فقط (لا يرى شيئاً آخر من النظام)
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Phone, PhoneCall, PhoneOff, Clock, PhoneMissed, PhoneForwarded, LogOut, RefreshCw, CheckCircle2, Search } from 'lucide-react';
import { ORDER_STATUSES } from '../ecom/ecomConstants';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const CALL_RESULTS = [
  { key: 'confirmed', label: 'أكّد الطلب', icon: CheckCircle2, cls: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  { key: 'no_answer', label: 'لم يردّ', icon: PhoneMissed, cls: 'bg-amber-100 text-amber-800 hover:bg-amber-200' },
  { key: 'postponed', label: 'أجّل التأكيد', icon: Clock, cls: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
  { key: 'wrong_number', label: 'رقم خاطئ', icon: PhoneOff, cls: 'bg-slate-200 text-slate-700 hover:bg-slate-300' },
  { key: 'cancelled_by_phone', label: 'ألغى هاتفياً', icon: PhoneForwarded, cls: 'bg-red-100 text-red-700 hover:bg-red-200' },
];

export default function WorkerWorkspacePage() {
  const navigate = useNavigate();
  const [worker, setWorker] = useState(null);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState('queue');
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(true);
  const [actingOn, setActingOn] = useState(null);

  const token = localStorage.getItem('ecom_worker_token');

  const wapi = useCallback(async (method, path, body) => {
    const res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('ecom_worker_token');
      localStorage.removeItem('ecom_worker');
      navigate('/worker/login');
      throw new Error('auth');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'خطأ');
    return data;
  }, [token, navigate]);

  const load = useCallback(async () => {
    if (!token) { navigate('/worker/login'); return; }
    setBusy(true);
    try {
      const me = await wapi('GET', '/ecom-workers/me');
      setWorker(me.worker); setStats(me.stats);
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
      const list = await wapi('GET', `/ecom-workers/me/orders?view=${view}${q}`);
      setOrders(list.orders || []); setTotal(list.total || 0);
    } catch { /* handled */ }
    finally { setBusy(false); }
  }, [token, view, search, wapi, navigate]);

  useEffect(() => { load(); }, [load]);

  const act = async (order, result) => {
    setActingOn(order.id + result);
    try {
      await wapi('POST', `/ecom-workers/me/orders/${order.id}/call-attempt`, { result });
      await load();
    } catch (e) { /* toast-free: errors surface via reload */ }
    finally { setActingOn(null); }
  };

  const logout = () => {
    localStorage.removeItem('ecom_worker_token');
    localStorage.removeItem('ecom_worker');
    navigate('/worker/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900" dir="rtl" data-testid="worker-workspace">
      {/* رأس المساحة */}
      <header className="bg-emerald-700 text-white p-3 sticky top-0 z-10 shadow">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div>
            <div className="font-bold" data-testid="worker-name">{worker?.name || '…'}</div>
            <div className="text-[11px] text-emerald-100">{'مساحة تأكيد الطلبات'}</div>
          </div>
          {stats && (
            <div className="flex gap-3 text-center" data-testid="worker-stats-bar">
              <div><div className="font-bold">{stats.confirmed}</div><div className="text-[10px] text-emerald-100">{'مؤكَّدة'}</div></div>
              <div><div className="font-bold">{stats.shipped}</div><div className="text-[10px] text-emerald-100">{'مشحونة'}</div></div>
              <div><div className="font-bold">{stats.delivered}</div><div className="text-[10px] text-emerald-100">{'مُسلَّمة'}</div></div>
              <div><div className="font-bold text-amber-300">{Number(stats.commission_due || 0).toLocaleString()}</div><div className="text-[10px] text-emerald-100">{'عمولتي (دج)'}</div></div>
            </div>
          )}
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="text-white hover:bg-emerald-600" onClick={load} data-testid="worker-refresh"><RefreshCw className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-emerald-600" onClick={logout} data-testid="worker-logout"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-3 space-y-3">
        {/* تبويبات + بحث */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded-lg overflow-hidden border bg-white dark:bg-slate-800">
            <button className={`px-4 py-1.5 text-sm ${view === 'queue' ? 'bg-emerald-600 text-white' : ''}`} onClick={() => setView('queue')} data-testid="view-queue">{'طابور التأكيد'}</button>
            <button className={`px-4 py-1.5 text-sm ${view === 'mine' ? 'bg-emerald-600 text-white' : ''}`} onClick={() => setView('mine')} data-testid="view-mine">{'طلباتي المنفَّذة'}</button>
          </div>
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute right-2 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pr-8 h-9" placeholder={'بحث برقم الطلب/الاسم/الهاتف'} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="worker-search" />
          </div>
        </div>

        {busy ? (
          <div className="text-center py-10 text-muted-foreground">{'جارٍ التحميل…'}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground" data-testid="worker-empty">
            {view === 'queue' ? 'لا طلبات بانتظار التأكيد 🎉' : 'لم تنفّذ طلبات بعد'}
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">{total} {'طلباً'}</div>
            {orders.map((o) => {
              const st = ORDER_STATUSES[o.status] || ORDER_STATUSES.new;
              return (
                <div key={o.id} className="bg-white dark:bg-slate-800 border rounded-xl p-3 space-y-2 shadow-sm" data-testid={`worker-order-${o.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{o.order_code}</span>
                      <div className="font-semibold">{o.customer?.name || '—'}</div>
                      {(o.customer?.wilaya || o.customer?.city) && (
                        <div className="text-xs text-muted-foreground">{[o.customer?.wilaya, o.customer?.city].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                    <div className="text-left">
                      <Badge className={st.color}>{st.labelAr}</Badge>
                      <div className="font-bold text-emerald-700 mt-1">{Number(o.total || 0).toLocaleString()} {'دج'}</div>
                    </div>
                  </div>
                  {/* المنتجات */}
                  <div className="text-xs bg-muted/40 rounded-lg p-2 space-y-0.5">
                    {(o.items || []).map((it, i) => (
                      <div key={i} className="flex justify-between"><span>{it.name} × {it.qty}</span><span>{Number(it.total ?? (it.price * it.qty) ?? 0).toLocaleString()}</span></div>
                    ))}
                  </div>
                  {/* اتصال */}
                  {o.customer?.phone && (
                    <a href={`tel:${o.customer.phone}`} className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2 font-semibold" data-testid={`worker-call-${o.id}`}>
                      <Phone className="w-4 h-4" /><span dir="ltr">{o.customer.phone}</span>
                    </a>
                  )}
                  {/* نتيجة الاتصال */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {CALL_RESULTS.map((r) => {
                      const Icon = r.icon;
                      return (
                        <button key={r.key}
                          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium ${r.cls} ${r.key === 'confirmed' ? 'col-span-2 py-2' : ''}`}
                          disabled={actingOn === o.id + r.key}
                          onClick={() => act(o, r.key)}
                          data-testid={`worker-result-${r.key}-${o.id}`}>
                          <Icon className="w-3.5 h-3.5" />{r.label}
                        </button>
                      );
                    })}
                  </div>
                  {(o.confirmation_attempts || []).length > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      {'محاولات سابقة:'} {o.confirmation_attempts.length} — {'آخرها'} {o.confirmation_attempts[o.confirmation_attempts.length - 1].result_ar}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
