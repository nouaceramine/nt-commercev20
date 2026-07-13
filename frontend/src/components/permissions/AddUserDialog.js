/**
 * AddUserDialog - Add new user form
 * Extracted from PermissionsTab.js (Refactoring: Extract Component)
 */
import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import { AVAILABLE_ROLES } from '../../lib/permissionConstants';

export default function AddUserDialog({
  open, onOpenChange, language, t,
  onAdd, adding,
}) {
  const ar = language === 'ar';
  const [data, setData] = useState({ name: '', email: '', password: '', role: 'seller' });
  const [showPassword, setShowPassword] = useState(false);

  const update = (patch) => setData(prev => ({ ...prev, ...patch }));

  const handleAdd = () => {
    onAdd(data);
    setData({ name: '', email: '', password: '', role: 'seller' });
  };

  const handleClose = () => {
    onOpenChange(false);
    setData({ name: '', email: '', password: '', role: 'seller' });
  };

  const selectedRole = AVAILABLE_ROLES.find(r => r.value === data.role);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />{ar ? 'إضافة عامل جديد' : 'Ajouter un employé'}</DialogTitle>
          <DialogDescription>{ar ? 'أدخل بيانات العامل الجديد' : 'Entrez les informations du nouvel employé'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{ar ? 'الاسم الكامل *' : 'Nom complet *'}</Label>
            <Input value={data.name} onChange={(e) => update({ name: e.target.value })} placeholder={ar ? 'اسم العامل' : "Nom de l'employé"} />
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'البريد الإلكتروني *' : 'Email *'}</Label>
            <Input type="email" value={data.email} onChange={(e) => update({ email: e.target.value })} placeholder="employee@example.com" />
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'كلمة المرور *' : 'Mot de passe *'}</Label>
            <div className="relative">
              <Input type={showPassword ? 'text' : 'password'} value={data.password} onChange={(e) => update({ password: e.target.value })} placeholder="••••••••" className="pe-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                {showPassword ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'الدور الوظيفي *' : 'Rôle *'}</Label>
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
          {selectedRole && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-1">{ar ? 'وصف الدور:' : 'Description du rôle:'}</p>
              <p className="text-muted-foreground">{selectedRole[ar ? 'desc_ar' : 'desc_fr']}</p>
            </div>
          )}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={handleClose}>{ar ? 'إلغاء' : 'Annuler'}</Button>
            <Button className="flex-1" onClick={handleAdd} disabled={adding || !data.name || !data.email || !data.password}>
              {adding ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Plus className="h-4 w-4 me-2" />}
              {ar ? 'إضافة' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
