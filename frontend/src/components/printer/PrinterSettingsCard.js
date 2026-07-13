/**
 * PrinterSettingsCard - Hardware printer configuration
 * Extracted from PrinterTab.js (Refactoring: Extract Component)
 */
import { Printer, Cable, Wifi, Monitor } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

export default function PrinterSettingsCard({ settings, onChange, language }) {
  const ar = language === 'ar';

  const update = (patch) => onChange(prev => ({ ...prev, ...patch }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          {ar ? 'إعدادات الطابعة' : "Paramètres de l'imprimante"}
        </CardTitle>
        <CardDescription>{ar ? 'إعداد الطابعة لطباعة الفواتير والإيصالات' : "Configurer l'imprimante pour les factures et reçus"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10"><Printer className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-medium">{ar ? 'تفعيل الطابعة' : "Activer l'imprimante"}</p>
              <p className="text-sm text-muted-foreground">{ar ? 'طباعة الفواتير تلقائياً' : 'Impression automatique des factures'}</p>
            </div>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(v) => update({ enabled: v })} data-testid="toggle-printer" />
        </div>

        {settings.enabled && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{ar ? 'نوع الطابعة' : "Type d'imprimante"}</Label>
                <Select value={settings.type} onValueChange={(v) => update({ type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thermal">{ar ? 'طابعة حرارية (إيصالات)' : 'Thermique (reçus)'}</SelectItem>
                    <SelectItem value="laser">{ar ? 'طابعة ليزر' : 'Laser'}</SelectItem>
                    <SelectItem value="inkjet">{ar ? 'طابعة حبر' : "Jet d'encre"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ar ? 'طريقة الاتصال' : 'Type de connexion'}</Label>
                <Select value={settings.connectionType} onValueChange={(v) => update({ connectionType: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usb"><div className="flex items-center gap-2"><Cable className="h-4 w-4" />USB</div></SelectItem>
                    <SelectItem value="network"><div className="flex items-center gap-2"><Wifi className="h-4 w-4" />{ar ? 'شبكة (IP)' : 'Réseau (IP)'}</div></SelectItem>
                    <SelectItem value="bluetooth"><div className="flex items-center gap-2"><Monitor className="h-4 w-4" />Bluetooth</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {settings.connectionType === 'usb' && (
              <div>
                <Label>{ar ? 'اسم الطابعة' : "Nom de l'imprimante"}</Label>
                <Input value={settings.name} onChange={(e) => update({ name: e.target.value })}
                  placeholder={ar ? 'مثال: POS-58' : 'Ex: POS-58'} className="mt-1" />
              </div>
            )}

            {settings.connectionType === 'network' && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{ar ? 'عنوان IP' : 'Adresse IP'}</Label><Input value={settings.ipAddress} onChange={(e) => update({ ipAddress: e.target.value })} placeholder="192.168.1.100" className="mt-1" /></div>
                <div><Label>{ar ? 'المنفذ' : 'Port'}</Label><Input value={settings.port} onChange={(e) => update({ port: e.target.value })} placeholder="9100" className="mt-1" /></div>
              </div>
            )}

            {settings.type === 'thermal' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{ar ? 'عرض الورق' : 'Largeur du papier'}</Label>
                  <Select value={settings.paperWidth} onValueChange={(v) => update({ paperWidth: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="58">58mm</SelectItem><SelectItem value="80">80mm</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>{ar ? 'عدد النسخ' : 'Nombre de copies'}</Label><Input type="number" min="1" max="5" value={settings.printCopies} onChange={(e) => update({ printCopies: parseInt(e.target.value) || 1 })} className="mt-1" /></div>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="font-medium">{ar ? 'طباعة تلقائية' : 'Impression automatique'}</p>
                <p className="text-sm text-muted-foreground">{ar ? 'طباعة الفاتورة تلقائياً بعد كل عملية بيع' : 'Imprimer automatiquement après chaque vente'}</p>
              </div>
              <Switch checked={settings.autoPrint} onCheckedChange={(v) => update({ autoPrint: v })} />
            </div>

            <Button variant="outline" className="gap-2">
              <Printer className="h-4 w-4" />
              {ar ? 'طباعة اختبارية' : "Test d'impression"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
