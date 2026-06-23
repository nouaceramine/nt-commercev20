import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { LoadingState } from '../components/LoadingState';
import { formatCurrency, formatShortDate } from '../utils/globalDateFormatter';
import {
  Tv, Users, AlertTriangle, CheckCircle2, XCircle, DollarSign,
  Boxes, Wallet, ArrowLeft, Plus,
} from 'lucide-react';

export default function DigitalPanelPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [stats, setStats] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, e] = await Promise.all([
          apiClient.get('/digital-panel/stats'),
          apiClient.get('/digital-panel/subscriptions/expiring', { params: { days: 7 } }),
        ]);
        setStats(s.data);
        setExpiring(e.data || []);
      } catch (err) {
        // handled by interceptor
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = stats ? [
    { label: ar ? 'إجمالي الاشتراكات' : 'Total abonnements', value: stats.total_subscriptions, icon: Tv, color: 'text-blue-600' },
    { label: ar ? 'نشطة' : 'Actifs', value: stats.active, icon: CheckCircle2, color: 'text-green-600' },
    { label: ar ? 'قرب الانتهاء' : 'Bientôt expirés', value: stats.expiring, icon: AlertTriangle, color: 'text-amber-600' },
    { label: ar ? 'منتهية' : 'Expirés', value: stats.expired, icon: XCircle, color: 'text-red-600' },
    { label: ar ? 'إجمالي الأرباح' : 'Profits totaux', value: formatCurrency(stats.total_profit), icon: DollarSign, color: 'text-emerald-600' },
    { label: ar ? 'إجمالي المبيعات' : 'Total ventes', value: formatCurrency(stats.total_sales), icon: DollarSign, color: 'text-indigo-600' },
    { label: ar ? 'الموزّعون' : 'Revendeurs', value: stats.resellers_count, icon: Users, color: 'text-purple-600' },
    { label: ar ? 'أرصدة الموزّعين' : 'Soldes revendeurs', value: formatCurrency(stats.resellers_balance), icon: Wallet, color: 'text-cyan-600' },
  ] : [];

  const quickLinks = [
    { to: '/digital-panel/subscriptions', label: ar ? 'الاشتراكات' : 'Abonnements', icon: Tv },
    { to: '/digital-panel/resellers', label: ar ? 'الموزّعون' : 'Revendeurs', icon: Users },
    { to: '/digital-panel/services', label: ar ? 'كتالوج الخدمات' : 'Catalogue', icon: Boxes },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Tv className="h-7 w-7 text-primary" />
              {ar ? 'بانل الخدمات الرقمية' : 'Panel services digitaux'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {ar ? 'إدارة اشتراكات IPTV والخدمات الرقمية والموزّعين' : 'Gestion IPTV, services digitaux et revendeurs'}
            </p>
          </div>
          <Link to="/digital-panel/subscriptions">
            <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90">
              <Plus className="h-4 w-4" />
              {ar ? 'اشتراك جديد' : 'Nouvel abonnement'}
            </button>
          </Link>
        </div>

        {loading ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {cards.map((c, i) => {
                const Icon = c.icon;
                return (
                  <Card key={i}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">{c.label}</div>
                        <div className="text-xl font-bold mt-1">{c.value}</div>
                      </div>
                      <Icon className={`h-8 w-8 ${c.color} opacity-80`} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {quickLinks.map((q) => {
                const Icon = q.icon;
                return (
                  <Link key={q.to} to={q.to}>
                    <Card className="hover:border-primary transition-colors cursor-pointer">
                      <CardContent className="p-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6 text-primary" />
                          <span className="font-medium">{q.label}</span>
                        </div>
                        <ArrowLeft className={`h-4 w-4 text-muted-foreground ${ar ? '' : 'rotate-180'}`} />
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  {ar ? 'اشتراكات قرب الانتهاء (7 أيام)' : 'Abonnements bientôt expirés (7 jours)'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {expiring.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {ar ? 'لا توجد اشتراكات قرب الانتهاء' : 'Aucun abonnement bientôt expiré'}
                  </p>
                ) : (
                  <div className="divide-y">
                    {expiring.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <div className="font-medium">{s.customer_name || s.service_name || '-'}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.service_name} · {s.server_name}
                          </div>
                        </div>
                        <div className="text-end">
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            {ar ? 'ينتهي' : 'Expire'}: {formatShortDate(s.end_date)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
