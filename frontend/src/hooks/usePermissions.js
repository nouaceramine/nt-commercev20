/**
 * usePermissions - Permissions management state
 * Extracted from PermissionsTab.js (Refactoring: Extract Hook)
 */
import { useState, useCallback } from 'react';
import apiClient from '../lib/apiClient';

export function usePermissions() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [defaultPermissions, setDefaultPermissions] = useState({});

  // Dialog states
  const [selectedUser, setSelectedUser] = useState(null);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [userPermissions, setUserPermissions] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '', password: '', role: 'seller' });
  const [addingUser, setAddingUser] = useState(false);

  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserData, setEditUserData] = useState({ name: '', email: '', role: '' });
  const [savingEditUser, setSavingEditUser] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiClient.get('/users'),
        apiClient.get('/permissions/roles'),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data.roles);
      setDefaultPermissions(rolesRes.data.default_permissions);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const openPermissions = useCallback(async (userId) => {
    try {
      const res = await apiClient.get(`/users/${userId}/permissions`);
      setSelectedUser(users.find(u => u.id === userId));
      setUserPermissions(res.data.permissions);
      setShowPermissionsDialog(true);
    } catch (e) { /* ignore */ }
  }, [users]);

  const savePermissions = useCallback(async () => {
    if (!selectedUser) return false;
    setSavingPermissions(true);
    try {
      await apiClient.put(`/users/${selectedUser.id}/permissions`, userPermissions);
      return true;
    } catch { return false; }
    finally { setSavingPermissions(false); }
  }, [selectedUser, userPermissions]);

  const resetPermissions = useCallback(async () => {
    if (!selectedUser) return false;
    try {
      await apiClient.put(`/users/${selectedUser.id}/reset-permissions`, {});
      setUserPermissions(defaultPermissions[selectedUser.role] || {});
      return true;
    } catch { return false; }
  }, [selectedUser, defaultPermissions]);

  const updatePermission = useCallback((category, action, value) => {
    setUserPermissions(prev => {
      const updated = { ...prev };
      if (typeof updated[category] === 'object') {
        updated[category] = { ...updated[category], [action]: value };
      } else {
        updated[category] = value;
      }
      return updated;
    });
  }, []);

  const deleteUser = useCallback(async (userId) => {
    try {
      await apiClient.delete(`/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      return true;
    } catch { return false; }
  }, []);

  const addUser = useCallback(async () => {
    setAddingUser(true);
    try {
      await apiClient.post('/auth/register', newUserData);
      setNewUserData({ name: '', email: '', password: '', role: 'seller' });
      return true;
    } catch { return false; }
    finally { setAddingUser(false); }
  }, [newUserData]);

  const editUser = useCallback(async () => {
    if (!editingUser) return false;
    setSavingEditUser(true);
    try {
      await apiClient.put(`/users/${editingUser.id}`, editUserData);
      return true;
    } catch { return false; }
    finally { setSavingEditUser(false); }
  }, [editingUser, editUserData]);

  const changePassword = useCallback(async () => {
    if (!passwordUser || newPassword.length < 4) return false;
    setSavingPassword(true);
    try {
      await apiClient.put(`/users/${passwordUser.id}/password`, { new_password: newPassword });
      return true;
    } catch { return false; }
    finally { setSavingPassword(false); }
  }, [passwordUser, newPassword]);

  return {
    loading, users, setUsers, roles, defaultPermissions,
    selectedUser, setSelectedUser,
    showPermissionsDialog, setShowPermissionsDialog,
    userPermissions, setUserPermissions,
    savingPermissions,
    showAddUserDialog, setShowAddUserDialog,
    newUserData, setNewUserData,
    addingUser,
    showPasswordDialog, setShowPasswordDialog,
    passwordUser, setPasswordUser,
    newPassword, setNewPassword,
    savingPassword,
    showEditUserDialog, setShowEditUserDialog,
    editingUser, setEditingUser,
    editUserData, setEditUserData,
    savingEditUser,
    fetchData,
    openPermissions, savePermissions, resetPermissions, updatePermission,
    deleteUser, addUser, editUser, changePassword,
  };
}
