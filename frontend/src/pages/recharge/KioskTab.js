import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
  Smartphone, Copy, Check, Trash2, Plus, RefreshCw,
  CheckCircle2, XCircle, Hourglass, MonitorSmartphone,
} from 'lucide-react';

const STATUS_BADGE = {
  pending: { label: 'بانتظار الدفع', cls: 'text-amber-700 bg-amber-50 border-amber-300' },
  processing: { label: 'جاري التنفيذ', cls: 'text-blue-700 bg-blue-50 border-blue-300' },
  done: { label: 'تم التنفيذ', cls: 'text-green-700 bg-green-50 border-green-300' },
  rejected: { label: 'مرفوض', cls: 'text-red-700 bg-red-50 border-red-300' },
  expired: { label: 'منتهي', cls: 'text-slate-600 bg-slate-100 border-slate-300' },
  failed: { label: 'فشل', cls: 'text-red-700 bg-red-50 border-red-300' },
};

const fmt = (n) => `${Number(n || 0).toLocaleString('fr-DZ')} دج`;

export default function KioskTab({ isAdmin }) {
  const [sessions, setSessions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [approveBox, setApproveBox] = useState({});
  const [newSession, setNewSession] = useState(null); // freshly created {token, path,...}
  const [label, setLabel] = useState('كشك الخدمة الذاتية');
  const [hours, setHours] = useState(12);
  const [maxAmount, setMaxAmount] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  const loadSessions = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const r = await apiClient.get('/kiosk/sessions');
      setSessions(r.data || []);
    } catch { /* silent */ }
  }, [isAdmin]);

  const loadRequests = useCallback(async () => {
    try {
      const r = await apiClient.get('/kiosk/requests');
      setRequests(r.data.requests || []);
      setPendingCount(r.data.pending_count || 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadSessions();
    loadRequests();
    apiClient.get('/cash-boxes').then((r) => setCashBoxes(r.data || [])).catch(() => {});
    pollRef.current = setInterval(loadRequests, 8000);
    return () => clearInterval(pollRef.current);
  }, [loadSessions, loadRequests]);

  const createSession = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post('/kiosk/sessions', {
        label, expires_hours: Number(hours) || 12, max_amount: Number(maxAmount) || 5000,
      });
      setNewSession(r.data);
      toast.success('تم إنشاء رابط الكشك');
      loadSessions();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر إنشاء الجلسة');
    } finally {
      setBusy(false);
    }
  };

  const revokeSession = async (id) => {
    try {
      await apiClient.delete(`/kiosk/sessions/${id}`);
      toast.success('تم إيقاف الجلسة');
      loadSessions();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر الإيقاف');
    }
  };

  const approve = async (req) => {
    const box = approveBox[req.id] || 'cash';
    try {
      await apiClient.post(`/kiosk/requests/${req.id}/approve`, { cash_box_id: box });
      toast.success(`تم تنفيذ الطلب ${req.code}`);
      loadRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل التنفيذ');
      loadRequests();
    }
  };

  const reject = async (req) => {
    try {
      await apiClient.post(`/kiosk/requests/${req.id}/reject`);
      toast.success('تم رفض الطلب');
      loadRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر الرفض');
    }
  };

  const kioskUrl = newSession ? `${window.location.origin}${newSession.path}` : '';
  const copyUrl = () => {
    navigator.clipboard?.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pending = requests.filter((r) => r.status === 'pending' || r.status === 'processing');
  const decided = requests.filter((r) => !['pending', 'processing'].includes(r.status)).slice(0, 10);

  return (
    <div className="grid gap-6 md:grid-cols-2" data-testid="kiosk-tab">
      {/* ============ Requests queue ============ */}
      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Hourglass className="w-5 h-5 text-amber-500" />
            طلبات الزبائن
            {pendingCount > 0 && (
              <Badge className="bg-amber-500" data-testid="kiosk-pending-badge">{pendingCount}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadRequests} data-testid="kiosk-refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {pending.length === 0 && (
            <p className="text-muted-foreground text-center py-6">لا توجد طلبات معلّقة — طلبات الزبائن من الكشك تظهر هنا فوراً</p>
          )}
          <div className="space-y-3" data-testid="kiosk-requests-list">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 border rounded-xl p-4 bg-amber-50/40"
                data-testid={`kiosk-request-${r.id}`}>
                <span className="text-2xl font-black text-amber-600">{r.code}</span>
                <span className="font-semibold flex-1">{r.summary}</span>
                <span className="text-lg font-bold text-emerald-600">{fmt(r.price_estimate)}</span>
                <Select value={approveBox[r.id] || 'cash'} onValueChange={(v) => setApproveBox((s) => ({ ...s, [r.id]: v }))}>
                  <SelectTrigger className="w-32" data-testid={`kiosk-cashbox-${r.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(cashBoxes.length ? cashBoxes : [{ id: 'cash', name: 'الصندوق' }]).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name || b.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approve(r)}
                  data-testid={`kiosk-approve-${r.id}`} disabled={r.status !== 'pending'}>
                  <CheckCircle2 className="w-4 h-4 ml-1" /> قبضت المبلغ — نفّذ
                </Button>
                <Button variant="destructive" onClick={() => reject(r)} data-testid={`kiosk-reject-${r.id}`}
                  disabled={r.status !== 'pending'}>
                  <XCircle className="w-4 h-4 ml-1" /> رفض
                </Button>
              </div>
            ))}
          </div>

          {decided.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-muted-foreground mb-2">آخر الطلبات المعالَجة</p>
              <div className="space-y-2">
                {decided.map((r) => {
                  const b = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                  return (
                    <div key={r.id} className="flex items-center gap-3 border rounded-lg p-3 text-sm">
                      <span className="font-bold">{r.code}</span>
                      <span className="flex-1 text-muted-foreground">{r.summary}</span>
                      <span className="font-semibold">{fmt(r.price_final || r.price_estimate)}</span>
                      <span className={`border rounded-full px-2 py-0.5 text-xs ${b.cls}`}>{b.label}</span>
                      {r.error && <span className="text-xs text-red-500">{r.error}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ Sessions (admin) ============ */}
      {isAdmin && (
        <Card className="md:col-span-2">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MonitorSmartphone className="w-5 h-5 text-cyan-600" />
              روابط الكشك (وضع الخدمة الذاتية)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>اسم الجلسة</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-48" data-testid="kiosk-session-label" />
              </div>
              <div>
                <Label>المدة (ساعات)</Label>
                <Input type="number" min="1" max="72" value={hours} onChange={(e) => setHours(e.target.value)} className="w-24" data-testid="kiosk-session-hours" />
              </div>
              <div>
                <Label>أقصى مبلغ للطلب</Label>
                <Input type="number" min="100" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="w-32" data-testid="kiosk-session-max" />
              </div>
              <Button onClick={createSession} disabled={busy} className="bg-cyan-600 hover:bg-cyan-700" data-testid="kiosk-create-session">
                <Plus className="w-4 h-4 ml-1" /> إنشاء رابط كشك
              </Button>
            </div>

            {newSession && (
              <div className="border-2 border-cyan-500 rounded-xl p-4 bg-cyan-50/50 flex flex-wrap items-center gap-6" data-testid="kiosk-session-link">
                <div className="bg-white p-2 rounded-lg"><QRCodeSVG value={kioskUrl} size={110} /></div>
                <div className="flex-1 min-w-[220px]">
                  <p className="font-bold text-cyan-800 mb-1">افتح هذا الرابط على هاتف/تابلت الزبون:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white border rounded px-2 py-1 flex-1 overflow-hidden text-ellipsis" dir="ltr">{kioskUrl}</code>
                    <Button variant="outline" size="sm" onClick={copyUrl} data-testid="kiosk-copy-link">
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                        يعمل على أي جهاز متصل بالإنترنت — صالح حتى {new Date(newSession.expires_at).toLocaleString('ar-DZ')}
                  </p>
                </div>
              </div>
            )}

            {sessions.length > 0 && (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 border rounded-lg p-3 text-sm">
                    <Smartphone className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-muted-foreground text-xs">حتى {new Date(s.expires_at).toLocaleString('ar-DZ')}</span>
                    <span className={`border rounded-full px-2 py-0.5 text-xs ${s.active && !s.expired ? 'text-green-700 bg-green-50 border-green-300' : 'text-slate-500 bg-slate-100'}`}>
                      {s.active && !s.expired ? 'نشطة' : 'متوقفة'}
                    </span>
                    {s.active && (
                      <Button variant="ghost" size="sm" onClick={() => revokeSession(s.id)} data-testid={`kiosk-revoke-${s.id}`}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
