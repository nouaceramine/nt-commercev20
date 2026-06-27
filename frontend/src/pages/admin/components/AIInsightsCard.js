/**
 * AIInsightsCard — Hourly LLM-powered snapshot for the super-admin Monitoring dashboard.
 * Reads from /api/saas/ai-insights (1h Redis cache). Refresh button busts the cache.
 */
import { useEffect, useState } from 'react';
import apiClient from '../../../lib/apiClient';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Sparkles, RefreshCcw, TrendingUp, AlertTriangle, Target, Loader2 } from 'lucide-react';

const HealthScoreRing = ({ score = 0 }) => {
  const safe = Math.max(0, Math.min(100, score));
  const stroke = safe >= 75 ? '#10b981' : safe >= 50 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (safe / 100) * circumference;
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle cx="28" cy="28" r="22" fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle
          cx="28" cy="28" r="22" fill="none"
          stroke={stroke} strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: stroke }}>
        {safe}
      </div>
    </div>
  );
};

export const AIInsightsCard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/ai-insights');
      setData(res.data);
    } catch (err) {
      setData({ error: err?.response?.data?.detail || 'فشل تحميل التحليلات الذكية' });
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await apiClient.post('/saas/ai-insights/refresh');
      setData(res.data);
    } catch {
      /* fallback to existing payload */
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <Card data-testid="ai-insights-card-loading">
        <CardContent className="p-4 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          جارٍ توليد التحليلات الذكية...
        </CardContent>
      </Card>
    );
  }
  if (!data || data.error) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {data?.error || 'لا توجد تحليلات متاحة'}
        </CardContent>
      </Card>
    );
  }

  const sourceLabel = data.source === 'llm' ? 'ذكاء صناعي' : 'حسابي';
  const sourceColor = data.source === 'llm' ? 'bg-violet-100 text-violet-800' : 'bg-gray-100 text-gray-700';

  return (
    <Card className="border-violet-200" data-testid="ai-insights-card">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <HealthScoreRing score={data.health_score} />
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                نظرة ذكية على المنصة
                <Badge className={`text-[10px] px-1 py-0 ${sourceColor}`}>{sourceLabel}</Badge>
                {data.cached && <Badge variant="outline" className="text-[10px] px-1 py-0">📦 مُخزَّن</Badge>}
              </div>
              <h3 className="text-base font-bold mt-1">{data.headline || 'لقطة عامة'}</h3>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing} data-testid="ai-insights-refresh-btn">
            <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Highlights */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-emerald-800 flex items-center gap-1 mb-2">
              <TrendingUp className="w-3 h-3" />
              نقاط القوة
            </div>
            <ul className="space-y-1 text-sm text-emerald-900">
              {(data.highlights || []).slice(0, 4).map((h, i) => (
                <li key={i} className="flex items-start gap-1"><span>•</span><span>{h}</span></li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-amber-800 flex items-center gap-1 mb-2">
              <AlertTriangle className="w-3 h-3" />
              مخاطر يجب مراقبتها
            </div>
            <ul className="space-y-1 text-sm text-amber-900">
              {(data.risks || []).slice(0, 4).map((r, i) => (
                <li key={i} className="flex items-start gap-1"><span>•</span><span>{r}</span></li>
              ))}
            </ul>
          </div>

          {/* Recommendations */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-blue-800 flex items-center gap-1 mb-2">
              <Target className="w-3 h-3" />
              توصيات قابلة للتنفيذ
            </div>
            <ul className="space-y-1 text-sm text-blue-900">
              {(data.recommendations || []).slice(0, 4).map((rec, i) => (
                <li key={i} className="flex items-start gap-1"><span>•</span><span>{rec}</span></li>
              ))}
            </ul>
          </div>
        </div>

        {data.served_at && (
          <div className="text-[10px] text-muted-foreground text-end">
            آخر تحديث: {new Date(data.served_at).toLocaleString('ar-DZ')}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AIInsightsCard;
