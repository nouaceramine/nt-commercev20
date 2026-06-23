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
  Edit2, 
  Trash2, 
  FolderTree,
  Package,
  ChevronRight,
  PlusCircle,
  Save
} from 'lucide-react';

export default function ProductFamiliesPage() {
  const { t, language, isRTL } = useLanguage();
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingFamily, setEditingFamily] = useState(null);
  const [form, setForm] = useState({
    name: '',  // خانة واحدة فقط
    description: '',
    parent_id: ''
  });

  useEffect(() => {
    fetchFamilies();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFamilies = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/product-families`);
      setFamilies(response.data);
    } catch (error) {
      console.error('Error fetching families:', error);
      toast.error(t.error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (createNew = false) => {
    if (!form.name) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم العائلة' : 'Veuillez entrer le nom de la famille');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const data = {
        name_en: form.name,
        name_ar: form.name,
        description_en: form.description,
        description_ar: form.description,
        parent_id: form.parent_id || null
      };

      if (editingFamily) {
        await apiClient.put(`/product-families/${editingFamily.id}`, data);
        toast.success(t.familyUpdated);
        setShowDialog(false);
        resetForm();
      } else {
        await apiClient.post(`/product-families`, data);
        toast.success(t.familyAdded);
        if (createNew) {
          resetForm();
        } else {
          setShowDialog(false);
          resetForm();
        }
      }

      fetchFamilies();
    } catch (error) {
      console.error('Error saving family:', error);
      toast.error(error.response?.data?.detail || t.error);
    }
  };

  const handleEdit = (family) => {
    setEditingFamily(family);
    setForm({
      name: family.name_ar || family.name_en,
      description: family.description_ar || family.description_en,
      parent_id: family.parent_id || ''
    });
    setShowDialog(true);
  };

  const handleDelete = async (familyId) => {
    if (!window.confirm(t.deleteConfirm)) return;

    try {
      await apiClient.delete(`/product-families/${familyId}`);
      toast.success(t.familyDeleted);
      fetchFamilies();
    } catch (error) {
      console.error('Error deleting family:', error);
      const detail = error.response?.data?.detail || '';
      if (detail.includes('products')) {
        toast.error(t.cannotDeleteFamilyWithProducts);
      } else if (detail.includes('sub-families')) {
        toast.error(t.cannotDeleteFamilyWithChildren);
      } else {
        toast.error(t.error);
      }
    }
  };

  const resetForm = () => {
    setEditingFamily(null);
    setForm({
      name: '',
      description: '',
      parent_id: ''
    });
  };

  const openAddDialog = () => {
    resetForm();
    setShowDialog(true);
  };

  // Organize families into tree structure
  const mainFamilies = families.filter(f => !f.parent_id);
  const getSubFamilies = (parentId) => families.filter(f => f.parent_id === parentId);

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
            <h1 className="text-2xl font-bold">{t.productFamilies}</h1>
            <p className="text-muted-foreground">
              {language === 'ar' ? 'تنظيم المنتجات في عائلات وفئات' : 'Organize products into families and categories'}
            </p>
          </div>
          <Button onClick={openAddDialog} data-testid="add-family-btn">
            <Plus className="h-4 w-4 me-2" />
            {t.addFamily}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <FolderTree className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'إجمالي العائلات' : 'Total Families'}
                </p>
                <p className="text-2xl font-bold">{families.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <FolderTree className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'العائلات الرئيسية' : 'Main Families'}
                </p>
                <p className="text-2xl font-bold">{mainFamilies.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Package className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'إجمالي المنتجات المصنفة' : 'Categorized Products'}
                </p>
                <p className="text-2xl font-bold">
                  {families.reduce((sum, f) => sum + (f.product_count || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Families Table */}
        <div className="bg-card rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">{language === 'ar' ? 'الرمز' : 'Code'}</TableHead>
                <TableHead>{t.familyName}</TableHead>
                <TableHead>{t.parentFamily}</TableHead>
                <TableHead>{t.productCount}</TableHead>
                <TableHead>{t.description}</TableHead>
                <TableHead>{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {families.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <FolderTree className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">{t.noFamilies}</p>
                  </TableCell>
                </TableRow>
              ) : (
                families.map((family) => (
                  <TableRow key={family.id} data-testid={`family-row-${family.id}`}>
                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {family.code || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {family.parent_id && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <FolderTree className={`h-4 w-4 ${family.parent_id ? 'text-muted-foreground' : 'text-primary'}`} />
                        <span className="font-medium">
                          {language === 'ar' ? family.name_ar : family.name_en}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {family.parent_name ? (
                        <Badge variant="outline">{family.parent_name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={family.product_count > 0 ? 'default' : 'secondary'}>
                        {family.product_count || 0} {language === 'ar' ? 'منتج' : 'products'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {language === 'ar' ? family.description_ar : family.description_en || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(family)}
                          data-testid={`edit-family-${family.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(family.id)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`delete-family-${family.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingFamily ? t.editFamily : t.addFamily}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{language === 'ar' ? 'اسم العائلة' : 'Nom de la famille'} *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={language === 'ar' ? 'مثال: واقيات الشاشة' : 'Ex: Protections d\'écran'}
                  data-testid="family-name-input"
                />
              </div>

              <div>
                <Label>{t.parentFamily}</Label>
                <Select
                  value={form.parent_id || "no-parent"}
                  onValueChange={(value) => setForm({ ...form, parent_id: value === "no-parent" ? "" : value })}
                >
                  <SelectTrigger data-testid="parent-family-select">
                    <SelectValue placeholder={t.noParent} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-parent">{t.noParent}</SelectItem>
                    {families
                      .filter(f => !f.parent_id && f.id !== editingFamily?.id)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name_ar || f.name_en}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{language === 'ar' ? 'الوصف' : 'Description'}</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={language === 'ar' ? 'وصف اختياري...' : 'Description optionnelle...'}
                  data-testid="family-desc-input"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  {t.cancel}
                </Button>
                {!editingFamily && (
                  <Button variant="outline" onClick={() => handleSubmit(true)} className="gap-2" data-testid="save-and-new-family-btn">
                    <PlusCircle className="h-4 w-4" />
                    {language === 'ar' ? 'حفظ وإنشاء جديد' : 'Enregistrer et créer'}
                  </Button>
                )}
                <Button onClick={() => handleSubmit(false)} className="gap-2" data-testid="save-family-btn">
                  <Save className="h-4 w-4" />
                  {t.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
