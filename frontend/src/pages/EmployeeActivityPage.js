import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { toast } from 'sonner';
import { Activity, RefreshCw, ShoppingCart, Banknote, Trash2, CalendarCheck, Loader2 } from 'lucide-react';

const TYPE_META = {
  sale:        { label: 'بيع',     icon: ShoppingCart,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  transaction: { label: 'صندوق',   icon: Banknote,      cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  audit:       { label: 'حذف/تدقيق', icon: Trash2,      cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  attendance:  { label: 'حضور',    icon: CalendarCheck, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const fmtDZ = (n) => Number(n || 0).toLocaleString('ar-DZ', { maximumFractionDigits: 2 });
const fmtAt = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso.slice(0, 16).replace('T', ' '); }
};

export default function EmployeeActivityPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ total: 0, by_type: {}, events: [] });
  const [users, setUsers] = useState([]);
  const [employee, setEmployee] = useState('all');
  const [eventType, setEventType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (employee !== 'all') params.employee = employee;
      if (eventType !== 'all') params.event_type = eventType;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await apiClient.get('/activity/employees', { params });
      setData(res.data);
    } catch (e) {
      if (e.response?.status !== 403) toast.error('تعذر تحميل سجل النشاط');
    } finally {
      setLoading(false);
    }
  }, [employee, eventType, startDate, endDate]);

  useEffect(() => {
    apiClient.get('/users').then((r) => setUsers(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout>
      <div className="space-y-6" data-testid="employee-activity-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-indigo-600" />
              {language === 'ar' ? 'سجل نشاط الموظفين' : "Journal d'activité"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'ar' ? 'من فعل ماذا ومتى — مبيعات، صندوق، حذف، حضور' : 'Qui a fait quoi et quand'}
            </p>
          </div>
          <Button variant="outline" onClick={load} data-testid="activity-refresh-btn">
            <RefreshCw className="w-4 h-4 ml-2" />
            تحديث
          </Button>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(TYPE_META).map(([k, m]) => (
            <Badge key={k} variant="outline" className={m.cls} data-testid={`activity-count-${k}`}>
              {m.label}: {data.by_type?.[k] || 0}
            </Badge>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={employee} onValueChange={setEmployee}>
              <SelectTrigger data-testid="activity-employee-filter"><SelectValue placeholder="كل الموظفين" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.name}>{u.name} ({u.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger data-testid="activity-type-filter"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="sale">المبيعات</SelectItem>
                <SelectItem value="transaction">حركات الصندوق</SelectItem>
                <SelectItem value="audit">الحذف والتدقيق</SelectItem>
                <SelectItem value="attendance">الحضور</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="activity-start-date" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="activity-end-date" />
          </CardContent>
        </Card>

        {/* Timeline table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">آخر {data.total} حدث</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            ) : data.events.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="activity-empty">لا يوجد نشاط في هذه الفترة</div>
            ) : (
              <Table data-testid="activity-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">التفاصيل</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الوقت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((e, i) => {
                    const m = TYPE_META[e.type] || TYPE_META.sale;
                    const Icon = m.icon;
                    return (
                      <TableRow key={`${e.type}-${e.ref}-${i}`}>
                        <TableCell>
                          <Badge variant="outline" className={m.cls}>
                            <Icon className="w-3 h-3 ml-1" />
                            {m.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{e.by || '—'}</TableCell>
                        <TableCell className="max-w-md truncate" title={e.summary}>{e.summary}</TableCell>
                        <TableCell>{e.amount != null ? `${fmtDZ(e.amount)} دج` : '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtAt(e.at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
