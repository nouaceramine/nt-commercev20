// p314: شاشة العميل — لوحة أرقام طلبات عمومية (تلفاز المحل)، تحديث كل 10 ث
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Timer, ClipboardList } from 'lucide-react';

export default function OrderBoardPage() {
  const { tenantId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  const fetchBoard = useCallback(async () => {
    try {
      const r = await fetch(`/api/restaurant/public/board/${tenantId}`);
      if (!r.ok) { setErr(true); return; }
      setData(await r.json());
      setErr(false);
    } catch { setErr(true); }
  }, [tenantId]);

  useEffect(() => {
    fetchBoard();
    const t = setInterval(fetchBoard, 10000);
    return () => clearInterval(t);
  }, [fetchBoard]);

  const Col = ({ title, icon: Icon, codes, cls, testid }) => (
    <div className="flex-1 rounded-2xl border bg-card p-4 space-y-3" data-testid={testid}>
      <h2 className={`text-xl font-bold flex items-center gap-2 ${cls}`}><Icon className="h-6 w-6" /> {title} <span className="text-sm font-normal">({codes.length})</span></h2>
      <div className="flex flex-wrap gap-2">
        {codes.map(c => (
          <span key={c} className={`text-2xl font-mono font-bold rounded-xl px-4 py-2 border ${cls}`}>{c.split('-').pop()}</span>
        ))}
        {codes.length === 0 && <span className="text-muted-foreground text-sm">—</span>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6 space-y-6" dir="rtl" data-testid="board-page">
      <h1 className="text-3xl font-bold text-center">{err ? 'اللوحة غير متاحة' : 'حالة الطلبات'}</h1>
      {data && (
        <div className="flex flex-col md:flex-row gap-4">
          <Col title="قيد الاستلام" icon={ClipboardList} codes={data.board.pending} cls="text-amber-600" testid="board-pending" />
          <Col title="قيد التحضير" icon={Timer} codes={data.board.preparing} cls="text-blue-600" testid="board-preparing" />
          <Col title="جاهز" icon={CheckCircle2} codes={data.board.served} cls="text-emerald-600" testid="board-served" />
        </div>
      )}
    </div>
  );
}
