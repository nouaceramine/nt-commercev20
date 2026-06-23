import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { ClipboardList, Calendar, Play, Check, X } from 'lucide-react';

export function InventoryHistory({ inventorySessions, formatDate, setShowStartDialog, language }) {
  return (
    <Card data-testid="inventory-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {language === 'ar' ? 'سجل الجرد السابق' : 'Historique des inventaires'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {inventorySessions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium mb-2">{language === 'ar' ? 'لا يوجد سجل جرد سابق' : 'Aucun historique d\'inventaire'}</h3>
            <p className="mb-6">{language === 'ar' ? 'ابدأ أول جرد للمخزون الآن' : 'Commencez votre premier inventaire maintenant'}</p>
            <Button onClick={() => setShowStartDialog(true)} size="lg" className="gap-2">
              <Play className="h-5 w-5" />
              {language === 'ar' ? 'بدء أول جرد' : 'Démarrer le premier inventaire'}
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'ar' ? 'الاسم' : 'Nom'}</TableHead>
                <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                <TableHead>{language === 'ar' ? 'المنتجات' : 'Produits'}</TableHead>
                <TableHead>{language === 'ar' ? 'تم التطبيق' : 'Appliqué'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventorySessions.map(session => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">{session.name}</TableCell>
                  <TableCell>{formatDate(session.started_at)}</TableCell>
                  <TableCell>
                    <Badge className={session.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                      {session.status === 'completed' 
                        ? (language === 'ar' ? 'مكتمل' : 'Terminé')
                        : (language === 'ar' ? 'جاري' : 'En cours')}
                    </Badge>
                  </TableCell>
                  <TableCell>{Object.keys(session.counted_items || {}).length}</TableCell>
                  <TableCell>
                    {session.applied_changes ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
