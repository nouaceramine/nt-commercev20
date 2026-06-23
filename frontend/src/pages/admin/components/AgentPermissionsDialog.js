/**
 * AgentPermissionsDialog - Granular permission management for agents
 */
import { useState, useEffect } from 'react';
import apiClient from '../../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
import { Label } from '../../../components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '../../../components/ui/dialog';
import { toast } from 'sonner';
import {
  Shield, Users, BarChart3, CreditCard, Wallet, Headphones,
  UserCog, Settings, Save, RotateCcw, CheckCircle,
} from 'lucide-react';

const CATEGORY_ICONS = {
  tenants: Users,
  reports: BarChart3,
  subscriptions: CreditCard,
  payments: Wallet,
  support: Headphones,
  agents: UserCog,
  system: Settings,
};

const CATEGORY_COLORS = {
  tenants: 'from-blue-500 to-blue-600',
  reports: 'from-emerald-500 to-emerald-600',
  subscriptions: 'from-purple-500 to-purple-600',
  payments: 'from-amber-500 to-amber-600',
  support: 'from-cyan-500 to-cyan-600',
  agents: 'from-rose-500 to-rose-600',
  system: 'from-gray-500 to-gray-600',
};

export function AgentPermissionsDialog({ open, onOpenChange, agent, onSaved }) {
  const [permissions, setPermissions] = useState({});
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && agent) {
      fetchTemplate();
      fetchPermissions();
    }
  }, [open, agent]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTemplate = async () => {
    try {
      const res = await apiClient.get('/saas/permissions-template');
      setTemplate(res.data);
    } catch (err) {
      console.error('Error fetching template:', err);
    }
  };

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/saas/agents/${agent.id}/permissions`);
      setPermissions(res.data.permissions || {});
    } catch (err) {
      // Use agent's existing permissions as fallback
      setPermissions(agent.permissions || {});
    }
    setLoading(false);
  };

  const togglePermission = (key) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    if (!template) return;
    const all = {};
    Object.keys(template.permissions).forEach(key => { all[key] = true; });
    setPermissions(all);
  };

  const deselectAll = () => {
    if (!template) return;
    const none = {};
    Object.keys(template.permissions).forEach(key => { none[key] = false; });
    setPermissions(none);
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/saas/agents/${agent.id}/permissions`, permissions);
      toast.success('تم حفظ الصلاحيات بنجاح');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'حدث خطأ أثناء حفظ الصلاحيات');
    }
    setSaving(false);
  };

  if (!template || loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            جاري تحميل الصلاحيات...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Group permissions by category
  const groupedPerms = {};
  Object.entries(template.permissions).forEach(([key, meta]) => {
    const cat = meta.category;
    if (!groupedPerms[cat]) groupedPerms[cat] = [];
    groupedPerms[cat].push({ key, ...meta });
  });

  const enabledCount = Object.values(permissions).filter(Boolean).length;
  const totalCount = Object.keys(template.permissions).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="permissions-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            إدارة صلاحيات: {agent?.name}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{agent?.agent_type === 'reseller' ? 'موزع' : 'مساعد'}</Badge>
              <span>{enabledCount} / {totalCount} صلاحية مفعّلة</span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 pb-2 border-b">
          <Button variant="outline" size="sm" onClick={selectAll} className="gap-1">
            <CheckCircle className="h-3.5 w-3.5" /> تفعيل الكل
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> إلغاء الكل
          </Button>
          <div className="flex-1" />
          <div className="h-2 flex-1 max-w-40 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(enabledCount / totalCount) * 100}%` }}
            />
          </div>
        </div>

        {/* Permission Categories */}
        <div className="grid gap-4 py-2">
          {Object.entries(template.categories).map(([catKey, catMeta]) => {
            const perms = groupedPerms[catKey] || [];
            if (perms.length === 0) return null;
            const Icon = CATEGORY_ICONS[catKey] || Settings;
            const catEnabled = perms.filter(p => permissions[p.key]).length;
            const gradient = CATEGORY_COLORS[catKey] || 'from-gray-500 to-gray-600';

            return (
              <Card key={catKey} className="overflow-hidden">
                <CardHeader className={`p-3 bg-gradient-to-l ${gradient} text-white`}>
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {catMeta.label_ar}
                    </span>
                    <Badge variant="secondary" className="bg-white/20 text-white text-xs">
                      {catEnabled}/{perms.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {perms.map(perm => (
                      <div
                        key={perm.key}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer ${
                          permissions[perm.key]
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-muted/30 border-transparent hover:border-muted-foreground/20'
                        }`}
                        onClick={() => togglePermission(perm.key)}
                        data-testid={`perm-${perm.key}`}
                      >
                        <Label className="cursor-pointer text-sm flex-1">
                          {perm.label_ar}
                        </Label>
                        <Switch
                          checked={!!permissions[perm.key]}
                          onCheckedChange={() => togglePermission(perm.key)}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={savePermissions} disabled={saving} className="gap-2" data-testid="save-permissions-btn">
            <Save className="h-4 w-4" />
            {saving ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AgentPermissionsDialog;
