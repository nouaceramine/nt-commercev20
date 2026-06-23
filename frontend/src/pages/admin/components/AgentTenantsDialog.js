/**
 * AgentTenantsDialog - Assign tenants to an agent
 */
import { useState, useEffect } from 'react';
import apiClient from '../../../lib/apiClient';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '../../../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table';
import { toast } from 'sonner';
import { Search, Building, Save, Users } from 'lucide-react';

export function AgentTenantsDialog({ open, onOpenChange, agent, onSaved }) {
  const [allTenants, setAllTenants] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && agent) {
      fetchAllTenants();
      setSelectedIds(agent.assigned_tenant_ids || []);
    }
  }, [open, agent]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAllTenants = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/tenants');
      setAllTenants(res.data);
    } catch (err) {
      toast.error('خطأ في تحميل المستأجرين');
    }
    setLoading(false);
  };

  const toggle = (tenantId) => {
    setSelectedIds(prev =>
      prev.includes(tenantId)
        ? prev.filter(id => id !== tenantId)
        : [...prev, tenantId]
    );
  };

  const selectAll = () => {
    setSelectedIds(filteredTenants.map(t => t.id));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/saas/agents/${agent.id}/assign-tenants`, selectedIds);
      toast.success(`تم تعيين ${selectedIds.length} مستأجر للوكيل`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'حدث خطأ');
    }
    setSaving(false);
  };

  const filteredTenants = allTenants.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.name?.toLowerCase().includes(q) ||
           t.email?.toLowerCase().includes(q) ||
           t.company_name?.toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="tenants-assign-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            تعيين مستأجرين لـ: {agent?.name}
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              اختر المستأجرين الذين سيتمكن الوكيل من إدارتهم
              <Badge variant="outline" className="ms-2">{selectedIds.length} محدد</Badge>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Search and Quick Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو البريد..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9"
              data-testid="tenant-search"
            />
          </div>
          <Button variant="outline" size="sm" onClick={selectAll}>تحديد الكل</Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>إلغاء الكل</Button>
        </div>

        {/* Tenants Table */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
        ) : (
          <div className="border rounded-lg max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>المستأجر</TableHead>
                  <TableHead>الخطة</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map(tenant => {
                  const isSelected = selectedIds.includes(tenant.id);
                  const isAssignedToOther = tenant.agent_id && tenant.agent_id !== agent?.id;
                  return (
                    <TableRow
                      key={tenant.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                      onClick={() => toggle(tenant.id)}
                      data-testid={`tenant-row-${tenant.id}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggle(tenant.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">{tenant.email}</p>
                          {tenant.company_name && (
                            <p className="text-xs text-muted-foreground">{tenant.company_name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {tenant.plan_name || '---'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge variant={tenant.is_active ? 'default' : 'secondary'} className="text-xs">
                            {tenant.is_active ? 'نشط' : 'معطل'}
                          </Badge>
                          {isAssignedToOther && (
                            <Badge variant="outline" className="text-xs text-amber-600">
                              <Users className="h-3 w-3 me-1" />
                              وكيل آخر
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredTenants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      لا يوجد مستأجرون
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-2" data-testid="save-tenants-btn">
            <Save className="h-4 w-4" />
            {saving ? 'جاري الحفظ...' : `حفظ (${selectedIds.length} مستأجر)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AgentTenantsDialog;
