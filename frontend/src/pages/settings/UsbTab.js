import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Usb, Smartphone, Plus, RefreshCw } from 'lucide-react';

export default function UsbTab() {
  const { language } = useLanguage();
  const [settings, setSettings] = useState({
    enabled: false, port: '', baudRate: '9600',
    simSlots: [
      { id: 1, operator: '', phone: '', enabled: false },
      { id: 2, operator: '', phone: '', enabled: false }
    ]
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Usb className="h-5 w-5" />{language === 'ar' ? 'إعدادات شرائح USB' : 'Paramètres SIM USB'}</CardTitle>
        <CardDescription>{language === 'ar' ? 'ربط شرائح الهاتف عبر مفتاح USB لعمليات شحن الرصيد' : 'Connecter les cartes SIM via clé USB pour les recharges'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-100"><Usb className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="font-medium">{language === 'ar' ? 'تفعيل USB Modem' : 'Activer USB Modem'}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'استخدام شرائح SIM عبر منفذ USB' : 'Utiliser les cartes SIM via port USB'}</p>
            </div>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))} data-testid="toggle-usb" />
        </div>

        {settings.enabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{language === 'ar' ? 'منفذ USB' : 'Port USB'}</Label>
                <Select value={settings.port} onValueChange={(v) => setSettings(prev => ({ ...prev, port: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={language === 'ar' ? 'اختر المنفذ' : 'Sélectionner port'} /></SelectTrigger>
                  <SelectContent>
                    {['COM1', 'COM2', 'COM3', 'COM4', '/dev/ttyUSB0', '/dev/ttyUSB1'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{language === 'ar' ? 'سرعة الاتصال' : 'Vitesse baud'}</Label>
                <Select value={settings.baudRate} onValueChange={(v) => setSettings(prev => ({ ...prev, baudRate: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['9600', '19200', '38400', '115200'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-lg font-semibold">{language === 'ar' ? 'شرائح SIM' : 'Cartes SIM'}</Label>
              {settings.simSlots.map((slot, index) => (
                <div key={slot.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{language === 'ar' ? `شريحة ${slot.id}` : `SIM ${slot.id}`}</span>
                    </div>
                    <Switch checked={slot.enabled} onCheckedChange={(checked) => {
                      const newSlots = [...settings.simSlots];
                      newSlots[index].enabled = checked;
                      setSettings(prev => ({ ...prev, simSlots: newSlots }));
                    }} />
                  </div>
                  {slot.enabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{language === 'ar' ? 'المشغل' : 'Opérateur'}</Label>
                        <Select value={slot.operator} onValueChange={(v) => {
                          const newSlots = [...settings.simSlots];
                          newSlots[index].operator = v;
                          setSettings(prev => ({ ...prev, simSlots: newSlots }));
                        }}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder={language === 'ar' ? 'اختر' : 'Choisir'} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mobilis">Mobilis</SelectItem>
                            <SelectItem value="djezzy">Djezzy</SelectItem>
                            <SelectItem value="ooredoo">Ooredoo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{language === 'ar' ? 'رقم الهاتف' : 'Numéro'}</Label>
                        <Input value={slot.phone} onChange={(e) => {
                          const newSlots = [...settings.simSlots];
                          newSlots[index].phone = e.target.value;
                          setSettings(prev => ({ ...prev, simSlots: newSlots }));
                        }} placeholder="0555123456" className="mt-1" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" className="w-full gap-2" onClick={() => {
                setSettings(prev => ({ ...prev, simSlots: [...prev.simSlots, { id: prev.simSlots.length + 1, operator: '', phone: '', enabled: false }] }));
              }}><Plus className="h-4 w-4" />{language === 'ar' ? 'إضافة شريحة' : 'Ajouter SIM'}</Button>
            </div>

            <Button variant="outline" className="gap-2" data-testid="test-usb-btn"><RefreshCw className="h-4 w-4" />{language === 'ar' ? 'اختبار الاتصال' : 'Tester la connexion'}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
