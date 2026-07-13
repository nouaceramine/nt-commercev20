/**
 * PermissionsTab - User Permissions Management (Refactored)
 * Before: ~27K lines monolithic | After: ~70 lines composition
 * Refactoring: Extract Hook, Extract Component x5, Replace Magic Numbers
 *
 * Sub-components:
 *   - UsersTable          : Users list with actions
 *   - PermissionsDialog   : Edit user permissions
 *   - PasswordDialog      : Change user password
 *   - AddUserDialog       : Add new user
 *   - EditUserDialog      : Edit existing user
 */
import { useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';

import UsersTable from '../../components/permissions/UsersTable';
import PermissionsDialog from '../../components/permissions/PermissionsDialog';
import PasswordDialog from '../../components/permissions/PasswordDialog';
import AddUserDialog from '../../components/permissions/AddUserDialog';
import EditUserDialog from '../../components/permissions/EditUserDialog';

export default function PermissionsTab() {
  const { t, language } = useLanguage();
  const { user: currentUser } = useAuth();
  const {
    loading, users, setUsers,
    selectedUser, setSelectedUser,
    showPermissionsDialog, setShowPermissionsDialog,
    userPermissions,
    savingPermissions,
    showAddUserDialog, setShowAddUserDialog,
    addingUser,
    showPasswordDialog, setShowPasswordDialog,
    passwordUser, setPasswordUser,
    savingPassword,
    showEditUserDialog, setShowEditUserDialog,
    editingUser, setEditingUser,
    savingEditUser,
    fetchData,
    openPermissions, savePermissions, resetPermissions, updatePermission,
    deleteUser, addUser, editUser, changePassword,
  } = usePermissions();

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddUser = async (data) => {
    const success = await addUser(data);
    if (success) { setShowAddUserDialog(false); fetchData(); }
  };

  const handleEditUser = async (data) => {
    const success = await editUser(data);
    if (success) { setShowEditUserDialog(false); fetchData(); }
  };

  const handleChangePassword = async (password) => {
    const success = await changePassword(password);
    if (success) setShowPasswordDialog(false);
  };

  const handleDeleteUser = async (userId) => {
    const ar = language === 'ar';
    if (!window.confirm(ar ? 'هل أنت متأكد من حذف هذا المستخدم؟' : 'Are you sure?')) return;
    const success = await deleteUser(userId);
    if (success) fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="permissions-tab">
      <UsersTable
        users={users}
        currentUserId={currentUser?.id}
        language={language}
        t={t}
        onEdit={(u) => { setEditingUser(u); setShowEditUserDialog(true); }}
        onPermissions={openPermissions}
        onPassword={(u) => { setPasswordUser(u); setShowPasswordDialog(true); }}
        onDelete={handleDeleteUser}
        onAdd={() => setShowAddUserDialog(true)}
      />
      <PermissionsDialog
        open={showPermissionsDialog}
        onOpenChange={setShowPermissionsDialog}
        user={selectedUser}
        permissions={userPermissions}
        language={language}
        t={t}
        onUpdate={updatePermission}
        onSave={savePermissions}
        onReset={resetPermissions}
        saving={savingPermissions}
      />
      <PasswordDialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
        user={passwordUser}
        language={language}
        t={t}
        onSave={handleChangePassword}
        saving={savingPassword}
      />
      <AddUserDialog
        open={showAddUserDialog}
        onOpenChange={setShowAddUserDialog}
        language={language}
        t={t}
        onAdd={handleAddUser}
        adding={addingUser}
      />
      <EditUserDialog
        open={showEditUserDialog}
        onOpenChange={setShowEditUserDialog}
        user={editingUser}
        language={language}
        t={t}
        onSave={handleEditUser}
        saving={savingEditUser}
      />
    </div>
  );
}
