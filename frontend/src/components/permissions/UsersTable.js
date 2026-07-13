/**
 * UsersTable - Users list with action buttons
 * Extracted from PermissionsTab.js (Refactoring: Extract Component)
 */
import { Users, Plus, Edit2, Shield, Key, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { getRoleBadge } from '../../lib/permissionConstants';

export default function UsersTable({
  users, currentUserId, language, t,
  onEdit, onPermissions, onPassword, onDelete, onAdd,
}) {
  const ar = language === 'ar';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />{t.userPermissions}
            </CardTitle>
            <CardDescription>{ar ? 'إدارة المستخدمين وصلاحياتهم' : 'Gérer les utilisateurs et leurs permissions'}</CardDescription>
          </div>
          <Button onClick={onAdd} className="gap-2" data-testid="add-user-btn">
            <Plus className="h-4 w-4" />{ar ? 'إضافة عامل' : 'Ajouter'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.name}</TableHead>
              <TableHead>{t.email}</TableHead>
              <TableHead>{ar ? 'الدور' : 'Role'}</TableHead>
              <TableHead>{t.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => {
              const badge = getRoleBadge(u.role, language);
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs ${badge.colorClass}`}>{badge.label}</span></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(u)} title={ar ? 'تعديل' : 'Edit'}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPermissions(u.id)} disabled={u.id === currentUserId} title={t.permissions}><Shield className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPassword(u)} title={ar ? 'كلمة المرور' : 'Password'}><Key className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(u.id)} disabled={u.id === currentUserId || u.role === 'super_admin'} title={ar ? 'حذف' : 'Delete'}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
