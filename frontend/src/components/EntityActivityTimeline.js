import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  ShoppingCart, Banknote, Wrench, Globe, Truck, TrendingUp,
  FileText, AlertTriangle, Layers, History, Loader2,
} from 'lucide-react';

// p218: reusable per-entity activity timeline (customer / product / supplier).
// endpoint: e.g. `/activity/customer/<id>` — null disables fetching.
const TYPE_META = {
  sale: { icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-950/40' },
  debt_payment: { icon: Banknote, color: 'text-sky-600', bg: 'bg-sky-100 dark:bg-sky-950/40' },
  repair: { icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-950/40' },
  ecom_order: { icon: Globe, color: 'text-pink-600', bg: 'bg-pink-100 dark:bg-pink-950/40' },
  purchase: { icon: Truck, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-950/40' },
  supplier_payment: { icon: Banknote, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-950/40' },
  advance_payment: { icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-950/40' },
  price_change: { icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-950/40' },
  audit: { icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100 dark:bg-slate-800' },
  defective: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-950/40' },
  lot: { icon: Layers, color: 'text-teal-600', bg: 'bg-teal-100 dark:bg-teal-950/40' },
};

const EntityActivityTimeline = ({ endpoint, testid = 'activity-timeline' }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [period, setPeriod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!endpoint) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period === '7' || period === '30') {
        const from = new Date();
        from.setDate(from.getDate() - parseInt(period, 10));
        params.set('start_date', from.toISOString().slice(0, 10));
      } else if (period === 'custom') {
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);
      }
      const qs = params.toString();
      const res = await apiClient.get(`${endpoint}${qs ? `?${qs}` : ''}`);
      setData(res.data);
    } catch {
      setData({ total: 0, by_type: {}, events: [] });
    } finally {
      setLoading(false);
    }
  }, [endpoint, period, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="border rounded-lg p-3 space-y-3" data-testid={testid}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
          <History className="h-3 w-3" />{isAr ? 'سجل النشاط' : "Journal d'activité"}
        </p>
        <div className="flex items-center gap-2">
          {period === 'custom' && (
            <>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-7 w-32 text-xs" data-testid={`${testid}-start`} />
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-7 w-32 text-xs" data-testid={`${testid}-end`} />
            </>
          )}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-7 w-28 text-xs" data-testid={`${testid}-period`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'كل الفترات' : 'Tout'}</SelectItem>
              <SelectItem value="7">{isAr ? 'آخر 7 أيام' : '7 jours'}</SelectItem>
              <SelectItem value="30">{isAr ? 'آخر 30 يوماً' : '30 jours'}</SelectItem>
              <SelectItem value="custom">{isAr ? 'فترة مخصصة' : 'Période'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {loading ? (
        <p className="text-center text-muted-foreground py-6 text-xs flex items-center justify-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />{isAr ? 'جارٍ التحميل...' : 'Chargement...'}
        </p>
      ) : !data || (data.events || []).length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">
          {isAr ? 'لا عمليات في هذه الفترة' : 'Aucune opération sur cette période'}
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-1 pe-1">
          {data.events.map((ev, i) => {
            const meta = TYPE_META[ev.type] || TYPE_META.audit;
            const Icon = meta.icon;
            return (
              <div key={`${ev.ref || 'ev'}-${i}`} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50" data-testid={`${testid}-item`}>
                <span className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${meta.bg}`}>
                  <Icon className={`h-3 w-3 ${meta.color}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{ev.summary}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(ev.at || '').slice(0, 16).replace('T', ' ')}
                    {ev.by ? ` — ${ev.by}` : ''}
                    {ev.status === 'returned' ? (isAr ? ' — مُرجعة' : ' — retournée') : ''}
                  </p>
                </div>
                {ev.amount != null && (
                  <span className="text-xs font-semibold whitespace-nowrap">
                    {Number(ev.amount).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {isAr ? 'دج' : 'DA'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EntityActivityTimeline;
