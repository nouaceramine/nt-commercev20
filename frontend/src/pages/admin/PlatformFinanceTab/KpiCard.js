/** Gradient KPI card shared across finance dashboard sections. */
import { Card, CardContent } from "../../../components/ui/card";

export function KpiCard({ icon, label, value, suffix, sub, color, testId }) {
  const colorMap = {
    emerald: "from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900",
    rose:    "from-rose-50    to-rose-100    border-rose-200    text-rose-900",
    indigo:  "from-indigo-50  to-indigo-100  border-indigo-200  text-indigo-900",
    amber:   "from-amber-50   to-amber-100   border-amber-200   text-amber-900",
  };
  return (
    <Card className={`bg-gradient-to-br ${colorMap[color] || colorMap.indigo} border`} data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium opacity-80">{label}</span>
          <span className="opacity-70">{icon}</span>
        </div>
        <div className="text-2xl font-bold">{value} <span className="text-xs font-medium opacity-70">{suffix}</span></div>
        <div className="text-xs opacity-70 mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}
