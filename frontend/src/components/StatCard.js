import { Card, CardContent } from './ui/card';
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Users, Package, Receipt,
  ArrowUp, ArrowDown,
} from 'lucide-react';

const iconMap = {
  revenue: DollarSign,
  trend: TrendingUp,
  warning: AlertTriangle,
  users: Users,
  products: Package,
  sales: Receipt
};

const resolveIcon = (icon, fallback = DollarSign) => {
  if (!icon) return fallback;
  if (typeof icon === 'string') return iconMap[icon] || fallback;
  return icon;
};

/**
 * Flexible stat/metric card.
 *
 * Variants:
 *  - 'default' (existing): plain card, string icon key, color preset, `subtitle`.
 *  - 'gradient': gradient background + white text, icon component, `subValue`,
 *    `trend` rendered with TrendingUp/Down (used by DatabaseManager).
 *  - 'boxed': white card with icon in a colored rounded box, `subtext`,
 *    `trend` rendered with ArrowUp/Down + `trendLabel` (used by AdvancedDashboard).
 */
export const StatCard = ({
  title, value, icon = 'revenue', color, subtitle,
  variant = 'default',
  subValue, subtext, trend, trendLabel,
}) => {
  const Icon = resolveIcon(icon);

  if (variant === 'gradient') {
    return (
      <Card className={`bg-gradient-to-br ${color} text-white`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">{title}</p>
              <p className="text-xl font-bold">{value}</p>
              {subValue && <p className="text-xs opacity-70 mt-1">{subValue}</p>}
            </div>
            <div className="flex flex-col items-center">
              <Icon className="h-8 w-8 opacity-80" />
              {trend && (
                <span className={`text-xs mt-1 flex items-center ${trend > 0 ? 'text-green-200' : 'text-red-200'}`}>
                  {trend > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(trend)}%
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'boxed') {
    return (
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
            </div>
            <div className={`p-3 rounded-xl ${color}`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              <span>{Math.abs(trend)}% {trendLabel}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const colors = {
    primary: 'text-primary',
    green: 'text-green-500',
    orange: 'text-orange-500',
    red: 'text-red-500',
    blue: 'text-blue-500'
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <Icon className={`h-8 w-8 ${colors[color] || 'text-primary'}`} />
        </div>
      </CardContent>
    </Card>
  );
};

export const StatsGrid = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
    {stats.map((stat, i) => (
      <StatCard key={stat.title || stat.label || `stat-${i}`} {...stat} />
    ))}
  </div>
);
