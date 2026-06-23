import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Zap, ScanLine, Plus, CheckCircle2 } from 'lucide-react';

export function InventoryBarcodeScanner({
  quickCountMode, setQuickCountMode, barcodeInputRef,
  barcodeInput, setBarcodeInput, handleBarcodeSubmit,
  lastScannedProduct, countedItems, language
}) {
  return (
    <Card className="border-2 border-dashed border-primary/30" data-testid="inventory-barcode-scanner">
      <CardContent className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Zap className={`h-5 w-5 ${quickCountMode ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <Label htmlFor="quick-mode" className="cursor-pointer">
              {language === 'ar' ? 'وضع التأكيد السريع' : 'Mode confirmation rapide'}
            </Label>
            <Switch
              id="quick-mode"
              checked={quickCountMode}
              onCheckedChange={setQuickCountMode}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {quickCountMode 
              ? (language === 'ar' ? 'المسح يؤكد الكمية الحالية' : 'Le scan confirme la quantité actuelle')
              : (language === 'ar' ? 'المسح يضيف +1' : 'Le scan ajoute +1')}
          </div>
        </div>
        
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="absolute start-3 top-1/2 -translate-y-1/2 h-6 w-6 text-primary animate-pulse" />
            <Input
              ref={barcodeInputRef}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder={language === 'ar' ? 'امسح الباركود أو أدخله يدوياً...' : 'Scanner ou saisir le code-barres...'}
              className="ps-12 h-14 text-xl font-mono border-2 focus:border-primary"
              autoFocus
            />
          </div>
          <Button type="submit" size="lg" className="h-14 px-6">
            <Plus className="h-6 w-6" />
          </Button>
        </form>
        
        {lastScannedProduct && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">
                  {language === 'ar' ? lastScannedProduct.name_ar : lastScannedProduct.name_en}
                </p>
                <p className="text-sm text-green-600">
                  {language === 'ar' ? 'الكمية المجرودة:' : 'Quantité comptée:'} {countedItems[lastScannedProduct.id] || 0}
                </p>
              </div>
            </div>
            <Badge className="bg-green-600">{lastScannedProduct.barcode}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
