/**
 * PasswordDialog - Change user password
 * Extracted from PermissionsTab.js (Refactoring: Extract Component)
 */
import { useState } from 'react';
import { Key, Save, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';

export default function PasswordDialog({
  open, onOpenChange, user, language, t,
  onSave, saving,
}) {
  const ar = language === 'ar';
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  const handleSave = () => {
    onSave(password);
    setPassword('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPassword(''); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5" />{ar ? 'تغيير كلمة المرور' : 'Changer le mot de passe'}</DialogTitle>
          <DialogDescription>{user?.name} ({user?.email})</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{ar ? 'كلمة المرور الجديدة' : 'Nouveau mot de passe'}</Label>
            <div className="relative mt-1">
              <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={ar ? '4 أحرف على الأقل' : '4 caractères minimum'} className="pe-10" />
              <button type="button" onClick={() => setShow(!show)} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">{t.cancel}</Button>
            <Button onClick={handleSave} disabled={saving || password.length < 4} className="flex-1 gap-2"><Save className="h-4 w-4" />{saving ? t.loading : t.save}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
