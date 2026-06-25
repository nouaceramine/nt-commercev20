import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import apiClient from "../lib/apiClient";
import { Loader2, Trash2, Download, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";

const LEVELS = [
  { value: "all", label: "كل المستويات" },
  { value: "error", label: "أخطاء" },
  { value: "warn", label: "تحذيرات" },
  { value: "info", label: "معلومات" },
];
const SOURCES = [
  { value: "all", label: "كل المصادر" },
  { value: "frontend", label: "الواجهة" },
  { value: "backend", label: "الخادم" },
  { value: "api", label: "طلبات API" },
];

const levelStyles = {
  error: "bg-red-100 text-red-800 border-red-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
};

export default function SystemLogsPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (level !== "all") params.level = level;
      if (source !== "all") params.source = source;
      if (search.trim()) params.search = search.trim();
      const [logsRes, statsRes] = await Promise.all([
        apiClient.get("/system-logs", { params }),
        apiClient.get("/system-logs/stats"),
      ]);
      setLogs(logsRes.data?.items || []);
      setStats(statsRes.data || null);
    } catch (e) {
      toast.error("فشل تحميل السجل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [level, source]);

  const handleDownload = async () => {
    try {
      const res = await apiClient.get("/system-logs/download", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      link.setAttribute("download", `system-logs-${ts}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("تم تنزيل السجل");
    } catch (_e) {
      toast.error("فشل التنزيل");
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await apiClient.post("/system-logs/analyze");
      setAnalysis(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل التحليل");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("سيتم حذف جميع السجلات. هل أنت متأكد؟")) return;
    try {
      const res = await apiClient.delete("/system-logs");
      toast.success(`تم حذف ${res.data?.deleted || 0} سجلاً`);
      load();
      setAnalysis(null);
    } catch (_e) {
      toast.error("فشل المسح");
    }
  };

  const summary = useMemo(() => {
    const counts = { error: 0, warn: 0, info: 0 };
    (stats?.by_level_source || []).forEach((b) => {
      const k = b._id?.level;
      if (k && counts[k] != null) counts[k] += b.count;
    });
    return counts;
  }, [stats]);

  return (
    <div className="p-6 space-y-6" dir="rtl" data-testid="system-logs-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            سجل أخطاء النظام
          </h1>
          <p className="text-sm text-muted-foreground">كل خطأ يحدث أثناء تصفحك يُسجَّل هنا. لا يتم تطبيق أي تصحيح تلقائياً.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} data-testid="refresh-logs-btn">
            <RefreshCw className="h-4 w-4 ml-2" /> تحديث
          </Button>
          <Button variant="outline" onClick={handleDownload} data-testid="download-logs-btn">
            <Download className="h-4 w-4 ml-2" /> تنزيل
          </Button>
          <Button onClick={handleAnalyze} disabled={analyzing} data-testid="analyze-logs-btn">
            {analyzing ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Sparkles className="h-4 w-4 ml-2" />}
            تحليل بالذكاء الاصطناعي
          </Button>
          <Button variant="destructive" onClick={handleClear} data-testid="clear-logs-btn">
            <Trash2 className="h-4 w-4 ml-2" /> مسح الكل
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card data-testid="stats-total"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي السجلات</div>
          <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
        </CardContent></Card>
        <Card data-testid="stats-errors"><CardContent className="p-4">
          <div className="text-xs text-red-600">أخطاء</div>
          <div className="text-2xl font-bold text-red-700">{summary.error}</div>
        </CardContent></Card>
        <Card data-testid="stats-warnings"><CardContent className="p-4">
          <div className="text-xs text-amber-600">تحذيرات</div>
          <div className="text-2xl font-bold text-amber-700">{summary.warn}</div>
        </CardContent></Card>
        <Card data-testid="stats-last"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">آخر تسجيل</div>
          <div className="text-sm font-medium">{stats?.last_at ? new Date(stats.last_at).toLocaleString("ar") : "—"}</div>
        </CardContent></Card>
      </div>

      {analysis && (
        <Card className="border-purple-200 bg-purple-50" data-testid="ai-analysis-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              تحليل الذكاء الاصطناعي
              <span className="text-xs text-muted-foreground mr-2">({analysis.count} خطأ)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="whitespace-pre-wrap text-sm">{analysis.summary}</div>
            {Array.isArray(analysis.suggestions) && analysis.suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold text-sm">الاقتراحات:</div>
                {analysis.suggestions.map((s, i) => (
                  <div key={i} className="bg-white border rounded p-3 text-sm">
                    <div className="font-medium">{i + 1}. {s.title || "—"}</div>
                    {s.action && <div className="text-gray-700 mt-1">{s.action}</div>}
                    {s.file && <div className="text-xs text-muted-foreground mt-1">📄 {s.file}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-40" data-testid="filter-level"><SelectValue /></SelectTrigger>
              <SelectContent>{LEVELS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-40" data-testid="filter-source"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input
              placeholder="بحث في الرسائل/الـURL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              className="max-w-xs"
              data-testid="search-input"
            />
            <Button variant="outline" onClick={load}>بحث</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-state">لا توجد سجلات حالياً ✅</div>
          ) : (
            <div className="space-y-2" data-testid="logs-list">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  data-testid={`log-row-${log.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge className={levelStyles[log.level] || levelStyles.info}>{log.level}</Badge>
                      <Badge variant="outline">{log.source}</Badge>
                      {log.type && <Badge variant="outline" className="text-gray-600">{log.type}</Badge>}
                      {log.status_code && <Badge variant="outline">{log.status_code}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("ar")}</div>
                  </div>
                  <div className="mt-2 text-sm break-words">{log.message}</div>
                  {log.url && <div className="text-xs text-muted-foreground mt-1 truncate">📍 {log.url}</div>}
                  {expanded === log.id && (
                    <div className="mt-3 space-y-2">
                      {log.stack && (
                        <pre className="text-xs bg-background text-foreground p-3 rounded overflow-auto max-h-64">{log.stack}</pre>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-40">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                      {log.user_email && <div className="text-xs text-muted-foreground">👤 {log.user_email}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
