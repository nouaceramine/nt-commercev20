/**
 * EditUserDialog - Edit existing user form
 * Extracted from PermissionsTab.js (Refactoring: Extract Component)
 */
import { useState, useEffect } from 'react';
import { Edit2, Save, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { AVAILABLE_ROLES } from '../../lib/permissionConstants';

export default function EditUserDialog({
  open, onOpenChange, user, language, t,
  onSave, saving,
}) {
  const ar = language === 'ar';
  const [data, setData] = useState({ name: '', email: '', role: '' });

  useEffect(() => {
    if (user) {
      setData({ name: user.name || '', email: user.email || '', role: user.role || '' });
    }
  }, [user]);

  const update = (patch) => setData(prev => ({ ...prev, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit2 className="h-5 w-5 text-primary" />{ar ? 'تعديل بيانات المستخدم' : 'Edit User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{ar ? 'الاسم الكامل' : 'Full Name'}</Label>
            <Input value={data.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'البريد الإلكتروني' : 'Email'}</Label>
            <Input type="email" value={data.email} onChange={(e) => update({ email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'الدور الوظيفي' : 'Role'}</Label>
            <Select value={data.role} onValueChange={(v) => update({ role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AVAILABLE_ROLES.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${role.color}`}></span>{ar ? role.label_ar : role.label_fr}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button className="flex-1" onClick={() => onSave(data)} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
              {ar ? 'حفظ التغييرات' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
