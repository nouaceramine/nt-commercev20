import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { toast } from 'sonner';
import { Volume2, VolumeX, RefreshCw, Save } from 'lucide-react';

export default function SoundTab() {
  const { language } = useLanguage();

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('soundSettings');
      return saved ? JSON.parse(saved) : { enabled: true, sale_success: true, error_sound: true, notification_sound: true, scan_beep: true, volume: 50 };
    } catch { return { enabled: true, sale_success: true, error_sound: true, notification_sound: true, scan_beep: true, volume: 50 }; }
  });
  const [saving, setSaving] = useState(false);

  const soundTypes = [
    { key: 'sale_success', label_ar: 'صوت البيع الناجح', label_fr: 'Sale Success', desc_ar: 'عند إتمام عملية البيع', desc_fr: 'When sale is completed', testId: 'toggle-sale-sound' },
    { key: 'error_sound', label_ar: 'صوت الخطأ', label_fr: 'Error Sound', desc_ar: 'عند حدوث خطأ', desc_fr: 'When error occurs', testId: 'toggle-error-sound' },
    { key: 'notification_sound', label_ar: 'صوت الإشعارات', label_fr: 'Notification Sound', desc_ar: 'عند وصول إشعار جديد', desc_fr: 'When notification arrives', testId: 'toggle-notification-sound' },
    { key: 'scan_beep', label_ar: 'صوت المسح', label_fr: 'Scan Beep', desc_ar: 'عند مسح الباركود', desc_fr: 'When barcode is scanned', testId: 'toggle-scan-sound' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5 text-primary" />{language === 'ar' ? 'إعدادات الصوت' : 'Sound Settings'}</CardTitle>
        <CardDescription>{language === 'ar' ? 'تحكم في أصوات التطبيق والتنبيهات' : 'Control application sounds and alerts'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-3">
            {settings.enabled ? <Volume2 className="h-6 w-6 text-green-600" /> : <VolumeX className="h-6 w-6 text-red-500" />}
            <div>
              <p className="font-medium">{language === 'ar' ? 'تفعيل الأصوات' : 'Enable Sounds'}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'تفعيل أو تعطيل جميع أصوات التطبيق' : 'Enable or disable all application sounds'}</p>
            </div>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))} data-testid="toggle-master-sound" />
        </div>

        {settings.enabled && (
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">{language === 'ar' ? 'أنواع الأصوات' : 'Sound Types'}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {soundTypes.map(st => (
                <div key={st.key} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{language === 'ar' ? st.label_ar : st.label_fr}</p>
                    <p className="text-xs text-muted-foreground">{language === 'ar' ? st.desc_ar : st.desc_fr}</p>
                  </div>
                  <Switch checked={settings[st.key]} onCheckedChange={(checked) => setSettings(prev => ({ ...prev, [st.key]: checked }))} data-testid={st.testId} />
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label>{language === 'ar' ? 'مستوى الصوت' : 'Volume Level'}</Label>
              <div className="flex items-center gap-4">
                <VolumeX className="h-4 w-4 text-muted-foreground" />
                <input type="range" min="0" max="100" value={settings.volume} onChange={(e) => setSettings(prev => ({ ...prev, volume: parseInt(e.target.value) }))}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary" data-testid="volume-slider" />
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span className="w-12 text-center font-mono text-sm">{settings.volume}%</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => {
                try {
                  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                  const oscillator = audioContext.createOscillator();
                  const gainNode = audioContext.createGain();
                  oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
                  oscillator.frequency.value = 880; gainNode.gain.value = settings.volume / 100 * 0.3;
                  oscillator.start(); setTimeout(() => oscillator.stop(), 200);
                  toast.success(language === 'ar' ? 'تم اختبار الصوت' : 'Sound tested');
                } catch { toast.error(language === 'ar' ? 'فشل تشغيل الصوت' : 'Sound test failed'); }
              }} className="gap-2" data-testid="test-sound-btn">
                <Volume2 className="h-4 w-4" />{language === 'ar' ? 'اختبار الصوت' : 'Test Sound'}
              </Button>
              <Button onClick={async () => {
                setSaving(true);
                try { localStorage.setItem('soundSettings', JSON.stringify(settings)); toast.success(language === 'ar' ? 'تم حفظ إعدادات الصوت' : 'Sound settings saved'); }
                catch { toast.error(language === 'ar' ? 'فشل حفظ الإعدادات' : 'Failed to save settings'); }
                finally { setSaving(false); }
              }} disabled={saving} className="gap-2" data-testid="save-sound-settings-btn">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {language === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
