import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Clock, AlertCircle, Play, StopCircle, Banknote, CreditCard,
  TrendingUp, Eye, TriangleAlert,
} from 'lucide-react';

export default function POSSessionBar({
  checkingSession, hasOpenSession, currentSession, sessionStats,
  setShowSessionDialog, setShowSessionDetailsDialog,
  setClosingCash, cashBoxBalance, setShowCloseSessionDialog,
  language, formatCurrency, t, isStaleSession,
}) {
  if (checkingSession) return null;

  return (
    <Card className={`mb-2 ${hasOpenSession ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'}`}>
      <CardContent className="p-3">
        {hasOpenSession && currentSession ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {isStaleSession && (
                <div className="flex items-center gap-1.5 bg-orange-100 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 rounded-md px-2 py-1 text-xs font-medium">
                  <TriangleAlert className="h-3.5 w-3.5 animate-pulse" />
                  {language === 'ar' ? 'حصة من يوم سابق! يُنصح بالإغلاق' : 'Session d\'un jour précédent!'}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg text-white ${isStaleSession ? 'bg-orange-500' : 'bg-emerald-500'}`}>
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'الحصة الحالية' : 'Session en cours'}</p>
                  <p className={`font-semibold text-sm ${isStaleSession ? 'text-orange-700' : 'text-emerald-700'}`}>
                    {currentSession.code || '#---'}
                  </p>
                </div>
              </div>
              {sessionStats && (
                <>
                  <div className="h-8 w-px bg-border hidden sm:block" />
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Banknote className="h-4 w-4 text-emerald-600" />
                      <span className="text-muted-foreground">{language === 'ar' ? 'نقدي:' : 'Cash:'}</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(sessionStats.cashSales)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CreditCard className="h-4 w-4 text-amber-600" />
                      <span className="text-muted-foreground">{language === 'ar' ? 'دين:' : 'Credit:'}</span>
                      <span className="font-bold text-amber-600">{formatCurrency(sessionStats.creditSales)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      <span className="text-muted-foreground">{language === 'ar' ? 'إجمالي:' : 'Total:'}</span>
                      <span className="font-bold text-blue-600">{formatCurrency(sessionStats.totalSales)}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {sessionStats.salesCount} {language === 'ar' ? 'عملية' : 'ventes'}
                    </Badge>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={() => setShowSessionDetailsDialog(true)}
                data-testid="session-details-btn"
              >
                <Eye className="h-3.5 w-3.5" />
                {language === 'ar' ? 'التفاصيل' : 'Details'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1 text-xs"
                onClick={() => {
                  setClosingCash(cashBoxBalance);
                  setShowCloseSessionDialog(true);
                }}
                data-testid="close-session-pos-btn"
              >
                <StopCircle className="h-3.5 w-3.5" />
                {language === 'ar' ? 'غلق الحصة' : 'Fermer'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span className="font-medium text-amber-800 dark:text-amber-200 text-sm">
                {language === 'ar' ? 'لا توجد حصة مفتوحة - يجب فتح حصة قبل البيع' : 'Aucune session - Ouvrez une session pour vendre'}
              </span>
            </div>
            <Button
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowSessionDialog(true)}
              data-testid="open-session-pos-btn"
            >
              <Play className="h-4 w-4" />
              {language === 'ar' ? 'فتح حصة' : 'Ouvrir session'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
