import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Key, 
  Copy, 
  Eye, 
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Globe,
  Lock,
  CheckCircle,
  XCircle
} from 'lucide-react';

export default function ApiKeysPage() {
  const { t, language, isRTL } = useLanguage();
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showKeyValue, setShowKeyValue] = useState({});
  const [newKey, setNewKey] = useState({
    name: '',
    type: 'internal',
    service: '',
    key_value: '',
    secret_value: '',
    endpoint_url: '',
    permissions: ['read']
  });

  useEffect(() => {
    fetchApiKeys();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchApiKeys = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/api-keys`);
      setApiKeys(response.data);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error(t.error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newKey.name) {
      toast.error(t.keyName + ' ' + t.error);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/api-keys`, newKey);
      toast.success(t.apiKeyAdded);
      setShowDialog(false);
      setNewKey({
        name: '',
        type: 'internal',
        service: '',
        key_value: '',
        secret_value: '',
        endpoint_url: '',
        permissions: ['read']
      });
      fetchApiKeys();
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error(t.error);
    }
  };

  const handleToggle = async (keyId) => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/api-keys/${keyId}/toggle`, {});
      fetchApiKeys();
    } catch (error) {
      console.error('Error toggling API key:', error);
      toast.error(t.error);
    }
  };

  const handleDelete = async (keyId) => {
    if (!window.confirm(t.deleteConfirm)) return;

    try {
      await apiClient.delete(`/api-keys/${keyId}`);
      toast.success(t.apiKeyDeleted);
      fetchApiKeys();
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error(t.error);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success(t.keyCopied);
  };

  const toggleKeyVisibility = (keyId) => {
    setShowKeyValue(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const handlePermissionChange = (permission) => {
    setNewKey(prev => {
      const perms = prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission];
      return { ...prev, permissions: perms };
    });
  };

  const services = [
    { value: 'woocommerce', label: 'WooCommerce' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'custom', label: language === 'ar' ? 'خدمة مخصصة' : 'Custom Service' }
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.apiKeys}</h1>
            <p className="text-muted-foreground">
              {language === 'ar' ? 'إدارة مفاتيح API للتكامل مع الخدمات الخارجية' : 'Manage API keys for external integrations'}
            </p>
          </div>
          <Button onClick={() => setShowDialog(true)} data-testid="add-api-key-btn">
            <Plus className="h-4 w-4 me-2" />
            {t.addApiKey}
          </Button>
        </div>

        {/* API Keys Table */}
        <div className="bg-card rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.keyName}</TableHead>
                <TableHead>{t.keyType}</TableHead>
                <TableHead>{t.service}</TableHead>
                <TableHead>{t.keyPreview}</TableHead>
                <TableHead>{t.permissions}</TableHead>
                <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                <TableHead>{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Key className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">{t.noApiKeys}</p>
                  </TableCell>
                </TableRow>
              ) : (
                apiKeys.map((key) => (
                  <TableRow key={key.id} data-testid={`api-key-row-${key.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {key.type === 'internal' ? (
                          <Lock className="h-4 w-4 text-primary" />
                        ) : (
                          <Globe className="h-4 w-4 text-green-500" />
                        )}
                        {key.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.type === 'internal' ? 'default' : 'secondary'}>
                        {key.type === 'internal' ? t.internal : t.external}
                      </Badge>
                    </TableCell>
                    <TableCell>{key.service || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {showKeyValue[key.id] ? key.key_value : key.key_preview}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleKeyVisibility(key.id)}
                          data-testid={`toggle-key-visibility-${key.id}`}
                        >
                          {showKeyValue[key.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(key.key_value)}
                          data-testid={`copy-key-${key.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {key.permissions?.map(p => (
                          <Badge key={p} variant="outline" className="text-xs">
                            {p === 'read' ? t.read : t.write}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(key.id)}
                        className={key.is_active ? 'text-green-500' : 'text-red-500'}
                        data-testid={`toggle-key-${key.id}`}
                      >
                        {key.is_active ? (
                          <>
                            <CheckCircle className="h-4 w-4 me-1" />
                            {t.keyActive}
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 me-1" />
                            {t.keyInactive}
                          </>
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(key.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`delete-key-${key.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add API Key Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t.addApiKey}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t.keyName} *</Label>
                <Input
                  value={newKey.name}
                  onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
                  placeholder={language === 'ar' ? 'مثال: مفتاح WooCommerce' : 'e.g., WooCommerce Key'}
                  data-testid="key-name-input"
                />
              </div>

              <div>
                <Label>{t.keyType}</Label>
                <Select
                  value={newKey.type}
                  onValueChange={(value) => setNewKey({ ...newKey, type: value })}
                >
                  <SelectTrigger data-testid="key-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">{t.internal}</SelectItem>
                    <SelectItem value="external">{t.external}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === 'ar' 
                    ? 'داخلي = مفتاح يُنشأ تلقائياً، خارجي = مفتاح من خدمة أخرى'
                    : 'Internal = auto-generated key, External = key from another service'}
                </p>
              </div>

              {newKey.type === 'external' && (
                <>
                  <div>
                    <Label>{t.service}</Label>
                    <Select
                      value={newKey.service}
                      onValueChange={(value) => setNewKey({ ...newKey, service: value })}
                    >
                      <SelectTrigger data-testid="service-select">
                        <SelectValue placeholder={language === 'ar' ? 'اختر الخدمة' : 'Select service'} />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{t.keyValue}</Label>
                    <Input
                      value={newKey.key_value}
                      onChange={(e) => setNewKey({ ...newKey, key_value: e.target.value })}
                      placeholder="ck_xxxxxxxxxxxxxxxx"
                      data-testid="key-value-input"
                    />
                  </div>

                  <div>
                    <Label>{t.secretValue}</Label>
                    <Input
                      type="password"
                      value={newKey.secret_value}
                      onChange={(e) => setNewKey({ ...newKey, secret_value: e.target.value })}
                      placeholder="cs_xxxxxxxxxxxxxxxx"
                      data-testid="secret-value-input"
                    />
                  </div>

                  <div>
                    <Label>{t.endpointUrl}</Label>
                    <Input
                      value={newKey.endpoint_url}
                      onChange={(e) => setNewKey({ ...newKey, endpoint_url: e.target.value })}
                      placeholder="https://example.com/wp-json/wc/v3"
                      data-testid="endpoint-url-input"
                    />
                  </div>
                </>
              )}

              <div>
                <Label>{t.permissions}</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newKey.permissions.includes('read')}
                      onChange={() => handlePermissionChange('read')}
                      className="rounded"
                    />
                    {t.read}
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newKey.permissions.includes('write')}
                      onChange={() => handlePermissionChange('write')}
                      className="rounded"
                    />
                    {t.write}
                  </label>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  {t.cancel}
                </Button>
                <Button onClick={handleCreate} data-testid="create-key-btn">
                  {newKey.type === 'internal' ? t.generateKey : t.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
