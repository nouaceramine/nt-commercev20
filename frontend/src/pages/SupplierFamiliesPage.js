import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { 
  Truck, 
  Plus, 
  Pencil, 
  Trash2, 
  FolderTree,
  Search
} from 'lucide-react';

export default function SupplierFamiliesPage() {
  const { t, language } = useLanguage();
  
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingFamily, setEditingFamily] = useState(null);
  const [deletingFamily, setDeletingFamily] = useState(null);
  
  // Form
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    fetchFamilies();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFamilies = async () => {
    try {
      const response = await apiClient.get(`/supplier-families`);
      setFamilies(response.data);
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ في جلب البيانات' : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (family = null) => {
    if (family) {
      setEditingFamily(family);
      setFormData({
        name: family.name,
        description: family.description || ''
      });
    } else {
      setEditingFamily(null);
      setFormData({ name: '', description: '' });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(language === 'ar' ? 'اسم العائلة مطلوب' : 'Le nom est requis');
      return;
    }
    
    try {
      if (editingFamily) {
        await apiClient.put(`/supplier-families/${editingFamily.id}`, formData);
        toast.success(language === 'ar' ? 'تم تحديث العائلة بنجاح' : 'Famille mise à jour');
      } else {
        await apiClient.post(`/supplier-families`, formData);
        toast.success(language === 'ar' ? 'تم إضافة العائلة بنجاح' : 'Famille ajoutée');
      }
      setShowDialog(false);
      fetchFamilies();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const handleDelete = async () => {
    if (!deletingFamily) return;
    
    try {
      await apiClient.delete(`/supplier-families/${deletingFamily.id}`);
      toast.success(language === 'ar' ? 'تم حذف العائلة بنجاح' : 'Famille supprimée');
      setShowDeleteDialog(false);
      setDeletingFamily(null);
      fetchFamilies();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const filteredFamilies = families.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="supplier-families-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {language === 'ar' ? 'عائلات الموردين' : 'Familles de fournisseurs'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تصنيف وتجميع الموردين في مجموعات' : 'Catégoriser et regrouper les fournisseurs'}
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2" data-testid="add-family-btn">
            <Plus className="h-4 w-4" />
            {language === 'ar' ? 'إضافة عائلة' : 'Ajouter famille'}
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={language === 'ar' ? 'البحث عن عائلة...' : 'Rechercher une famille...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-10"
                data-testid="search-input"
              />
            </div>
          </CardContent>
        </Card>

        {/* Families List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              {language === 'ar' ? 'العائلات' : 'Familles'}
              <Badge variant="secondary">{filteredFamilies.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredFamilies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{language === 'ar' ? 'لا توجد عائلات' : 'Aucune famille'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'الاسم' : 'Nom'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead>{language === 'ar' ? 'عدد الموردين' : 'Nb fournisseurs'}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFamilies.map(family => (
                    <TableRow key={family.id} data-testid={`family-row-${family.id}`}>
                      <TableCell className="font-medium">{family.name}</TableCell>
                      <TableCell className="text-muted-foreground">{family.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          <Truck className="h-3 w-3" />
                          {family.supplier_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(family)} data-testid={`edit-${family.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive"
                            onClick={() => { setDeletingFamily(family); setShowDeleteDialog(true); }}
                            disabled={family.supplier_count > 0}
                            data-testid={`delete-${family.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                {editingFamily 
                  ? (language === 'ar' ? 'تعديل العائلة' : 'Modifier famille')
                  : (language === 'ar' ? 'إضافة عائلة جديدة' : 'Nouvelle famille')}
              </DialogTitle>
              <DialogDescription>
                {language === 'ar' ? 'أدخل بيانات العائلة' : 'Entrez les informations de la famille'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{language === 'ar' ? 'اسم العائلة' : 'Nom de famille'} *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={language === 'ar' ? 'مثال: موردون محليون' : 'Ex: Fournisseurs locaux'}
                  className="mt-1"
                  data-testid="family-name-input"
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'الوصف' : 'Description'}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={language === 'ar' ? 'وصف العائلة (اختياري)' : 'Description (optionnel)'}
                  className="mt-1"
                  rows={3}
                  data-testid="family-desc-input"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  {t.cancel}
                </Button>
                <Button onClick={handleSave} data-testid="save-family-btn">
                  {editingFamily ? t.save : (language === 'ar' ? 'إضافة' : 'Ajouter')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {language === 'ar' ? 'تأكيد الحذف' : 'Confirmer la suppression'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {language === 'ar' 
                  ? `هل أنت متأكد من حذف عائلة "${deletingFamily?.name}"؟`
                  : `Êtes-vous sûr de vouloir supprimer "${deletingFamily?.name}"?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                {t.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
