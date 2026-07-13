/**
 * PermissionsDialog - Edit user permissions
 * Extracted from PermissionsTab.js (Refactoring: Extract Component)
 */
import { Save, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import { getPermissionCategories } from '../../lib/permissionConstants';

export default function PermissionsDialog({
  open, onOpenChange, user, permissions, language, t,
  onUpdate, onSave, onReset, saving,
}) {
  const ar = language === 'ar';
  const categories = getPermissionCategories(language);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{t.userPermissions}: {user?.name}</DialogTitle>
          <DialogDescription>{ar ? 'الدور' : 'Role'}: {user?.role}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4">
            {categories.map(cat => (
              <div key={cat.key} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="font-medium">{cat.label}</span>
                {cat.simple ? (
                  <Switch checked={!!permissions[cat.key]} onCheckedChange={(v) => onUpdate(cat.key, null, v)} />
                ) : (
                  <div className="flex gap-4">
                    {['view', 'add', 'edit', 'delete'].map(action => (
                      <label key={action} className="flex items-center gap-1 text-sm">
                        <Checkbox checked={permissions[cat.key]?.[action] || false} onCheckedChange={(v) => onUpdate(cat.key, action, v)} />
                        {action === 'view' ? t.viewPermission : action === 'add' ? t.addPermission : action === 'edit' ? t.editPermission : t.deletePermission}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onReset} className="gap-2"><RefreshCw className="h-4 w-4" />{t.resetToDefault}</Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button onClick={onSave} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{t.save}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
