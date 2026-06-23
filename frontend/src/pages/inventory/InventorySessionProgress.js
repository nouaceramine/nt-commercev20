import { Card, CardContent } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function InventorySessionProgress({ activeSession, progress, countedProducts, totalProducts, positiveCount, negativeCount, formatDate, language }) {
  return (
    <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20" data-testid="inventory-session-progress">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2">
            <h3 className="font-semibold text-xl mb-1">{activeSession.name}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {language === 'ar' ? 'بدأ في' : 'Démarré le'}: {formatDate(activeSession.started_at)}
            </p>
            <Progress value={progress} className="h-4" />
            <p className="text-sm text-muted-foreground mt-2">
              {countedProducts} / {totalProducts} ({Math.round(progress)}%)
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <TrendingUp className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{positiveCount}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'زيادة' : 'Surplus'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-xl">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{negativeCount}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'نقص' : 'Manque'}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
