import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  BookOpen,
  ArrowRight,
  Plus,
  Search,
  User,
  Phone,
  Edit,
  Trash2,
  Smartphone
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PhoneDirectoryPage() {
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', note: '' });

  // Sample contacts
  const [contacts, setContacts] = useState([
    { id: 1, name: 'أحمد محمد', phone: '0612345678', operator: 'Mobilis', note: 'زبون دائم' },
    { id: 2, name: 'سارة علي', phone: '0712345678', operator: 'Djezzy', note: '' },
    { id: 3, name: 'محمد خالد', phone: '0512345678', operator: 'Ooredoo', note: 'وكيل فرعي' },
    { id: 4, name: 'فاطمة أحمد', phone: '0698765432', operator: 'Mobilis', note: '' },
    { id: 5, name: 'علي سعيد', phone: '0787654321', operator: 'Djezzy', note: 'تعبئة يومية' },
  ]);

  const detectOperator = (phone) => {
    const prefix = phone.substring(0, 2);
    switch (prefix) {
      case '06': return 'Mobilis';
      case '07': return 'Djezzy';
      case '05': return 'Ooredoo';
      default: return 'Unknown';
    }
  };

  const getOperatorColor = (operator) => {
    switch (operator) {
      case 'Mobilis': return 'bg-green-500';
      case 'Djezzy': return 'bg-red-500';
      case 'Ooredoo': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const handleSaveContact = () => {
    if (!contactForm.name || !contactForm.phone) {
      toast.error(language === 'ar' ? 'يرجى ملء الاسم ورقم الهاتف' : 'Veuillez remplir le nom et le numéro');
      return;
    }

    if (contactForm.phone.length !== 10) {
      toast.error(language === 'ar' ? 'رقم الهاتف يجب أن يكون 10 أرقام' : 'Le numéro doit contenir 10 chiffres');
      return;
    }

    const operator = detectOperator(contactForm.phone);

    if (editingContact) {
      setContacts(prev => prev.map(c => 
        c.id === editingContact.id 
          ? { ...c, ...contactForm, operator }
          : c
      ));
      toast.success(language === 'ar' ? 'تم تحديث جهة الاتصال' : 'Contact mis à jour');
    } else {
      const newContact = {
        id: Date.now(),
        ...contactForm,
        operator
      };
      setContacts(prev => [newContact, ...prev]);
      toast.success(language === 'ar' ? 'تمت إضافة جهة الاتصال' : 'Contact ajouté');
    }

    setContactForm({ name: '', phone: '', note: '' });
    setEditingContact(null);
    setShowAddDialog(false);
  };

  const handleEditContact = (contact) => {
    setEditingContact(contact);
    setContactForm({ name: contact.name, phone: contact.phone, note: contact.note || '' });
    setShowAddDialog(true);
  };

  const handleDeleteContact = (id) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    toast.success(language === 'ar' ? 'تم حذف جهة الاتصال' : 'Contact supprimé');
  };

  const filteredContacts = contacts.filter(c =>
    c.name.includes(searchQuery) || c.phone.includes(searchQuery)
  );

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="phone-directory-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/services">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                  <BookOpen className="h-8 w-8 text-cyan-500" />
                </div>
                {language === 'ar' ? 'دليل الهاتف' : 'Annuaire téléphonique'}
              </h1>
              <p className="text-muted-foreground mt-1">
                {language === 'ar' ? 'إدارة جهات الاتصال والأرقام المحفوظة' : 'Gérer les contacts et numéros enregistrés'}
              </p>
            </div>
          </div>
          <Button onClick={() => {
            setEditingContact(null);
            setContactForm({ name: '', phone: '', note: '' });
            setShowAddDialog(true);
          }}>
            <Plus className="h-4 w-4 me-2" />
            {language === 'ar' ? 'إضافة جهة اتصال' : 'Ajouter un contact'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{contacts.length}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي جهات الاتصال' : 'Total contacts'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-500">{contacts.filter(c => c.operator === 'Mobilis').length}</p>
              <p className="text-sm text-muted-foreground">Mobilis</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-500">{contacts.filter(c => c.operator === 'Djezzy').length}</p>
              <p className="text-sm text-muted-foreground">Djezzy</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-orange-500">{contacts.filter(c => c.operator === 'Ooredoo').length}</p>
              <p className="text-sm text-muted-foreground">Ooredoo</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === 'ar' ? 'بحث بالاسم أو الرقم...' : 'Rechercher par nom ou numéro...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pe-10"
          />
        </div>

        {/* Contacts Table */}
        <Card>
          <CardHeader>
            <CardTitle>{language === 'ar' ? 'جهات الاتصال' : 'Contacts'}</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredContacts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{language === 'ar' ? 'لا توجد جهات اتصال' : 'Aucun contact'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'الاسم' : 'Nom'}</TableHead>
                    <TableHead>{language === 'ar' ? 'رقم الهاتف' : 'Téléphone'}</TableHead>
                    <TableHead>{language === 'ar' ? 'المشغل' : 'Opérateur'}</TableHead>
                    <TableHead>{language === 'ar' ? 'ملاحظة' : 'Note'}</TableHead>
                    <TableHead>{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map(contact => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.name}</TableCell>
                      <TableCell className="font-mono">{contact.phone}</TableCell>
                      <TableCell>
                        <Badge className={getOperatorColor(contact.operator)}>{contact.operator}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{contact.note || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditContact(contact)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDeleteContact(contact.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Link to={`/services/flexy?phone=${contact.phone}`}>
                            <Button variant="ghost" size="icon" className="text-primary">
                              <Smartphone className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Contact Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-cyan-500" />
                {editingContact 
                  ? (language === 'ar' ? 'تعديل جهة اتصال' : 'Modifier le contact')
                  : (language === 'ar' ? 'إضافة جهة اتصال' : 'Ajouter un contact')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'الاسم' : 'Nom'}</Label>
                <Input
                  placeholder={language === 'ar' ? 'اسم جهة الاتصال' : 'Nom du contact'}
                  value={contactForm.name}
                  onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'رقم الهاتف' : 'Numéro de téléphone'}</Label>
                <Input
                  type="tel"
                  placeholder="0X XX XX XX XX"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'ملاحظة (اختياري)' : 'Note (optionnel)'}</Label>
                <Input
                  placeholder={language === 'ar' ? 'ملاحظة' : 'Note'}
                  value={contactForm.note}
                  onChange={(e) => setContactForm(prev => ({ ...prev, note: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={handleSaveContact}>
                {editingContact 
                  ? (language === 'ar' ? 'تحديث' : 'Mettre à jour')
                  : (language === 'ar' ? 'إضافة' : 'Ajouter')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
