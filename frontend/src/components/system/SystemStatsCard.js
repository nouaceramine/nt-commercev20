/**
 * SystemStatsCard - Displays system statistics
 * Extracted from SystemTab.js (Refactoring: Extract Component)
 */
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export default function SystemStatsCard({ stats, language }) {
  const ar = language === 'ar';
  if (!stats) return null;

  const items = [
    { val: stats.products, label: ar ? 'منتج' : 'Products' },
    { val: stats.customers, label: ar ? 'زبون' : 'Customers' },
    { val: stats.sales, label: ar ? 'مبيعات' : 'Sales' },
    { val: stats.users, label: ar ? 'مستخدم' : 'Users' },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>{ar ? 'إحصائيات النظام' : 'System Statistics'}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map(s => (
            <div key={s.label} className="p-4 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{s.val}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
