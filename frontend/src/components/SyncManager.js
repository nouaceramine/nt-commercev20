import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { 
  RefreshCw, Send, History, Package, Bell, Award, Store, 
  Receipt, Palette, Folder, Lock, Unlock, CheckCircle, XCircle,
  Clock, Users, Settings
} from 'lucide-react';

const iconMap = {
  Receipt: Receipt, Bell: Bell, Award: Award, Store: Store,
  Package: Package, Folder: Folder, Palette: Palette
};

export const SyncManager = ({ tenants = [] }) => {
  const [syncTypes, setSyncTypes] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedTenants, setSelectedTenants] = useState([]);
  const [target, setTarget] = useState('all');
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetchSyncTypes();
    fetchSyncLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSyncTypes = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await apiClient.get(`/sync/available-types`);
      setSyncTypes(res.data);
    } catch (err) {
      console.error('Error fetching sync types:', err);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await apiClient.get(`/sync/logs?limit=20`);
      setSyncLogs(res.data);
    } catch (err) {
      console.error('Error fetching sync logs:', err);
    }
  };

  const toggleType = (typeId) => {
    setSelectedTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
  };

  const toggleTenant = (tenantId) => {
    setSelectedTenants(prev => 
      prev.includes(tenantId)
        ? prev.filter(t => t !== tenantId)
        : [...prev, tenantId]
    );
  };

  const selectAllTypes = () => {
    if (selectedTypes.length === syncTypes.length) {
      setSelectedTypes([]);
    } else {
      setSelectedTypes(syncTypes.map(t => t.id));
    }
  };

  const executeSync = async () => {
    if (selectedTypes.length === 0) {
      toast.error('اختر نوع واحد على الأقل للمزامنة');
      return;
    }
    
    setSyncing(true);
    try {
      const res = await apiClient.post(`/sync/execute`, {
        sync_types: selectedTypes,
        target: target,
        selected_tenants: target === 'selected' ? selectedTenants : []
      });
      
      toast.success(res.data.message);
      fetchSyncLogs();
      setShowConfirm(false);
      setSelectedTypes([]);
    } catch (err) {
      toast.error('فشل في المزامنة');
    } finally {
      setSyncing(false);
    }
  };

  const activeTenants = tenants.filter(t => t.status === 'active');

  return (
    <div className="space-y-6">
      {/* Sync Types Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              مزامنة البيانات
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowLogs(true)}>
                <History className="h-4 w-4 ml-1" />
                السجل
              </Button>
              <Button variant="outline" size="sm" onClick={selectAllTypes}>
                {selectedTypes.length === syncTypes.length ? 'إلغاء الكل' : 'تحديد الكل'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {syncTypes.map(type => {
              const Icon = iconMap[type.icon] || Package;
              const isSelected = selectedTypes.includes(type.id);
              return (
                <div
                  key={type.id}
                  onClick={() => toggleType(type.id)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox checked={isSelected} />
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{type.name}</span>
                  </div>
                  {type.count > 1 && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {type.count} عنصر
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Target Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            المستهدفون
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            {[
              { id: 'all', label: 'جميع المشتركين', count: tenants.length },
              { id: 'active', label: 'النشطين فقط', count: activeTenants.length },
              { id: 'selected', label: 'مشتركين محددين', count: selectedTenants.length }
            ].map(opt => (
              <Button
                key={opt.id}
                variant={target === opt.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTarget(opt.id)}
              >
                {opt.label}
                <Badge variant="secondary" className="mr-2">{opt.count}</Badge>
              </Button>
            ))}
          </div>

          {target === 'selected' && (
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {tenants.map(tenant => (
                  <div
                    key={tenant.id}
                    onClick={() => toggleTenant(tenant.id)}
                    className={`p-2 rounded border cursor-pointer text-sm ${
                      selectedTenants.includes(tenant.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox checked={selectedTenants.includes(tenant.id)} />
                      <span>{tenant.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Execute Button */}
      <div className="flex justify-center">
        <Button 
          size="lg" 
          onClick={() => setShowConfirm(true)}
          disabled={selectedTypes.length === 0}
          className="gap-2"
        >
          <Send className="h-5 w-5" />
          تنفيذ المزامنة
          {selectedTypes.length > 0 && (
            <Badge variant="secondary">{selectedTypes.length} نوع</Badge>
          )}
        </Button>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد المزامنة</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-3">سيتم مزامنة:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedTypes.map(typeId => {
                const type = syncTypes.find(t => t.id === typeId);
                return type ? (
                  <Badge key={typeId} variant="outline">{type.name}</Badge>
                ) : null;
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              إلى: {target === 'all' ? 'جميع المشتركين' : target === 'active' ? 'المشتركين النشطين' : `${selectedTenants.length} مشترك محدد`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>إلغاء</Button>
            <Button onClick={executeSync} disabled={syncing}>
              {syncing ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : null}
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              سجل المزامنة
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الأنواع</TableHead>
                  <TableHead>النجاح</TableHead>
                  <TableHead>الفشل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {new Date(log.created_at).toLocaleString('ar-DZ')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {log.sync_types?.map(t => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle className="h-3 w-3 ml-1" />
                        {log.success_count}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.failed_count > 0 ? (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 ml-1" />
                          {log.failed_count}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
