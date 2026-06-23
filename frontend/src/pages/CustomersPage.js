import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import PrintButton from '../components/print/PrintButton';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
  Users, Plus, Search, Edit, Trash2, Phone, Mail, MapPin, PlusCircle, Save, Ban, Shield, ShieldOff,
  Grid3X3, List, ArrowUpDown, SortAsc, SortDesc, Calendar, DollarSign, ShoppingCart
} from 'lucide-react';
import { ExportPrintButtons } from '../components/ExportPrintButtons';
import { Pagination } from '../components/Pagination';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import CustomerForm from '../components/forms/CustomerForm';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
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

export default function CustomersPage() {
  const { t, language, isRTL } = useLanguage();
  
  const [customers, setCustomers] = useState([]);
  const [customerFamilies, setCustomerFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // View mode and sorting
  const [viewMode, setViewMode] = useState(localStorage.getItem('customersViewMode') || 'grid');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(parseInt(localStorage.getItem('customersPerPage')) || 20);
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  const [formData, setFormData] = useState({
    name: '', 
    phone: '', 
    email: '', 
    address: '', 
    notes: '', 
    family_id: '',
    code: '',  // كود الزبون
    // New fields
    national_id: '',
    commercial_register: '',
    birthdate: '',
    customer_type: 'regular', // VIP, regular, new
    max_debt_limit: '',
    special_discount: ''
  });
  
  // Family dialog
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [savingFamily, setSavingFamily] = useState(false);
  
  // Blacklist state
  const [blacklist, setBlacklist] = useState([]);
  const [showBlacklistOnly, setShowBlacklistOnly] = useState(false);
  const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false);
  const [blacklistCustomer, setBlacklistCustomer] = useState(null);
  const [blacklistReason, setBlacklistReason] = useState('');

  const changeViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('customersViewMode', mode);
  };

  const handleItemsPerPageChange = (newValue) => {
    setItemsPerPage(newValue);
    setCurrentPage(1);
    localStorage.setItem('customersPerPage', newValue.toString());
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sort customers
  const sortedCustomers = [...customers].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'balance':
        comparison = (a.balance || 0) - (b.balance || 0);
        break;
      case 'total_purchases':
        comparison = (a.total_purchases || 0) - (b.total_purchases || 0);
        break;
      case 'created_at':
        comparison = new Date(a.created_at || 0) - new Date(b.created_at || 0);
        break;
      default:
        comparison = 0;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const fetchBlacklist = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/blacklist`);
      setBlacklist(response.data);
    } catch (error) {
      console.error('Error fetching blacklist:', error);
    }
  };

  const handleAddToBlacklist = async () => {
    if (!blacklistCustomer?.phone) {
      toast.error(language === 'ar' ? 'يجب أن يكون للزبون رقم هاتف' : 'Le client doit avoir un numéro de téléphone');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/blacklist`, {
        phone: blacklistCustomer.phone,
        reason: blacklistReason,
        notes: `${language === 'ar' ? 'الزبون:' : 'Client:'} ${blacklistCustomer.name}`
      });
      toast.success(language === 'ar' ? 'تمت إضافة الزبون للقائمة السوداء' : 'Client ajouté à la liste noire');
      setBlacklistDialogOpen(false);
      setBlacklistReason('');
      setBlacklistCustomer(null);
      fetchBlacklist();
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur est survenue'));
    }
  };

  const handleRemoveFromBlacklist = async (phone) => {
    const entry = blacklist.find(b => b.phone === phone);
    if (!entry) return;
    
    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/blacklist/${entry.id}`);
      toast.success(language === 'ar' ? 'تمت إزالة الزبون من القائمة السوداء' : 'Client retiré de la liste noire');
      fetchBlacklist();
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur est survenue'));
    }
  };

  const isBlacklisted = (phone) => {
    return phone && blacklist.some(b => b.phone === phone);
  };

  const fetchCustomers = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      params.set('page', currentPage.toString());
      params.set('page_size', itemsPerPage.toString());
      
      const response = await apiClient.get(`/customers/paginated?${params.toString()}`);
      setCustomers(response.data.items);
      setTotalItems(response.data.total);
    } catch (error) {
      console.error('Error fetching customers:', error);
      // Fallback to non-paginated endpoint
      try {
        const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
        const response = await apiClient.get(`/customers${params}`);
        setCustomers(response.data);
        setTotalItems(response.data.length);
      } catch (e) {
        console.error('Fallback also failed:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerFamilies = async () => {
    try {
      const response = await apiClient.get(`/customer-families`);
      setCustomerFamilies(response.data);
    } catch (error) {
      console.error('Error fetching customer families:', error);
    }
  };

  const handleAddFamily = async () => {
    if (!newFamilyName.trim()) return;
    setSavingFamily(true);
    try {
      await apiClient.post(`/customer-families`, { name: newFamilyName });
      toast.success(language === 'ar' ? 'تمت إضافة العائلة' : 'Famille ajoutée');
      setFamilyDialogOpen(false);
      setNewFamilyName('');
      fetchCustomerFamilies();
    } catch (error) {
      toast.error(language === 'ar' ? 'حدث خطأ' : 'Une erreur est survenue');
    } finally {
      setSavingFamily(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchBlacklist();
    fetchCustomerFamilies();
  }, [searchQuery, currentPage, itemsPerPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e, createNew = false) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (selectedCustomer) {
        await apiClient.put(`/customers/${selectedCustomer.id}`, formData);
        toast.success(t.customerUpdated);
        setDialogOpen(false);
        resetForm();
      } else {
        await apiClient.post(`/customers`, formData);
        toast.success(t.customerAdded);
        if (createNew) {
          resetForm();
        } else {
          setDialogOpen(false);
          resetForm();
        }
      }
      fetchCustomers();
    } catch (error) {
      toast.error(t.somethingWentWrong);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/customers/${selectedCustomer.id}`);
      toast.success(t.customerDeleted);
      setDeleteDialogOpen(false);
      setSelectedCustomer(null);
      fetchCustomers();
    } catch (error) {
      toast.error(t.somethingWentWrong);
    }
  };

  const openEditDialog = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || '',
      family_id: customer.family_id || '',
      code: customer.code || '',  // كود الزبون
      national_id: customer.national_id || '',
      commercial_register: customer.commercial_register || '',
      birthdate: customer.birthdate || '',
      customer_type: customer.customer_type || 'regular',
      max_debt_limit: customer.max_debt_limit || '',
      special_discount: customer.special_discount || ''
    });
    setDialogOpen(true);
  };

  const resetForm = async () => {
    setSelectedCustomer(null);
    // Generate new customer code
    try {
      const response = await apiClient.get(`/customers/generate-code`);
      setFormData({ 
        name: '', 
        phone: '', 
        email: '', 
        address: '', 
        notes: '', 
        family_id: '',
        code: response.data.code,  // كود الزبون التلقائي
        national_id: '',
        commercial_register: '',
        birthdate: '',
        customer_type: 'regular',
        max_debt_limit: '',
        special_discount: ''
      });
    } catch (error) {
      setFormData({ 
        name: '', phone: '', email: '', address: '', notes: '', family_id: '', code: '',
        national_id: '', commercial_register: '', birthdate: '', customer_type: 'regular',
        max_debt_limit: '', special_discount: ''
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="customers-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.customers}</h1>
            <p className="text-muted-foreground mt-1">{customers.length} {t.customers}</p>
          </div>
          <div className="flex gap-2 items-center">
            <ExportPrintButtons
              data={sortedCustomers.map(c => ({
                code: c.code || '-',
                name: c.name,
                phone: c.phone || '-',
                email: c.email || '-',
                type: c.customer_type === 'vip' ? 'VIP' : c.customer_type === 'new' ? (language === 'ar' ? 'جديد' : 'Nouveau') : (language === 'ar' ? 'عادي' : 'Régulier'),
                total_purchases: (c.total_purchases || 0).toLocaleString(),
                balance: (c.balance || 0).toLocaleString()
              }))}
              columns={[
                { key: 'code', label: language === 'ar' ? 'الكود' : 'Code' },
                { key: 'name', label: language === 'ar' ? 'الاسم' : 'Nom' },
                { key: 'phone', label: language === 'ar' ? 'الهاتف' : 'Téléphone' },
                { key: 'email', label: language === 'ar' ? 'البريد' : 'Email' },
                { key: 'type', label: language === 'ar' ? 'النوع' : 'Type' },
                { key: 'total_purchases', label: language === 'ar' ? 'المشتريات' : 'Achats' },
                { key: 'balance', label: language === 'ar' ? 'الرصيد' : 'Solde' }
              ]}
              filename={`customers_${new Date().toISOString().split('T')[0]}`}
              title={language === 'ar' ? 'قائمة الزبائن' : 'Liste des Clients'}
              language={language}
            />
            <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2" data-testid="add-customer-btn">
              <Plus className="h-5 w-5" />
              {t.addCustomer}
            </Button>
          </div>
        </div>

        {/* Search & Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
                <Input
                  type="text"
                  placeholder={language === 'ar' ? 'ابحث بالاسم أو الكود أو الهاتف...' : 'Rechercher par nom, code ou téléphone...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Play beep sound on barcode scan
                      try {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        const oscillator = audioContext.createOscillator();
                        const gainNode = audioContext.createGain();
                        oscillator.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        oscillator.frequency.value = 1200;
                        gainNode.gain.value = 0.3;
                        oscillator.start();
                        setTimeout(() => oscillator.stop(), 100);
                      } catch (e) {}
                    }
                  }}
                  className={`h-11 ${isRTL ? 'pr-10' : 'pl-10'}`}
                  data-testid="customer-search-input"
                />
              </div>
              
              {/* Sort By */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[150px]">
                  <ArrowUpDown className="h-4 w-4 me-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{language === 'ar' ? 'الاسم' : 'Nom'}</SelectItem>
                  <SelectItem value="balance">{language === 'ar' ? 'الرصيد' : 'Solde'}</SelectItem>
                  <SelectItem value="total_purchases">{language === 'ar' ? 'المشتريات' : 'Achats'}</SelectItem>
                  <SelectItem value="created_at">{language === 'ar' ? 'التاريخ' : 'Date'}</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Sort Order */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'تصاعدي' : 'تنازلي'}
              >
                {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              </Button>
              
              {/* View Mode */}
              <div className="flex border rounded-lg">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => changeViewMode('grid')}
                  className="rounded-e-none"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => changeViewMode('list')}
                  className="rounded-s-none"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Blacklist Filter */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                <Ban className={`h-4 w-4 ${showBlacklistOnly ? 'text-red-600' : 'text-gray-500'}`} />
                <Label className="text-sm cursor-pointer" htmlFor="blacklist-filter">
                  {language === 'ar' ? 'القائمة السوداء فقط' : 'Liste noire uniquement'}
                </Label>
                <Switch
                  id="blacklist-filter"
                  checked={showBlacklistOnly}
                  onCheckedChange={setShowBlacklistOnly}
                  data-testid="blacklist-filter-switch"
                />
              </div>
              
              {blacklist.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <Ban className="h-3 w-3" />
                  {blacklist.length} {language === 'ar' ? 'محظور' : 'bloqué(s)'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customers Display */}
        {loading ? (
          <LoadingState minHeight="40vh" />
        ) : sortedCustomers.length === 0 ? (
          <EmptyState icon={Users} title={t.noCustomers} />
        ) : viewMode === 'list' ? (
          /* List View - Table Format */
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">{language === 'ar' ? 'الرمز' : 'Code'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الاسم' : 'Nom'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الهاتف' : 'Téléphone'}</TableHead>
                    <TableHead>{language === 'ar' ? 'النوع' : 'Type'}</TableHead>
                    <TableHead className="text-center">{t.totalPurchases}</TableHead>
                    <TableHead className="text-center">{t.balance}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'آخر زيارة' : 'Dernière visite'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCustomers
                    .filter(customer => !showBlacklistOnly || isBlacklisted(customer.phone))
                    .map(customer => {
                      const customerIsBlacklisted = isBlacklisted(customer.phone);
                      return (
                        <TableRow 
                          key={customer.id} 
                          className={customerIsBlacklisted ? 'bg-red-50/50' : customer.customer_type === 'vip' ? 'bg-amber-50/30' : ''}
                          data-testid={`customer-row-${customer.id}`}
                        >
                          <TableCell>
                            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                              {customer.code || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{customer.name}</span>
                              {customer.customer_type === 'vip' && (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">VIP</Badge>
                              )}
                              {customer.customer_type === 'new' && (
                                <Badge className="bg-blue-100 text-blue-700 text-xs">{language === 'ar' ? 'جديد' : 'Nouveau'}</Badge>
                              )}
                              {customerIsBlacklisted && (
                                <Badge variant="destructive" className="text-xs gap-1">
                                  <Ban className="h-3 w-3" />
                                </Badge>
                              )}
                              {customer.special_discount > 0 && (
                                <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                                  {customer.special_discount}%
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell dir="ltr" className="text-muted-foreground">
                            {customer.phone || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {customer.customer_type === 'vip' ? 'VIP' : customer.customer_type === 'new' ? (language === 'ar' ? 'جديد' : 'Nouveau') : (language === 'ar' ? 'عادي' : 'Régulier')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {(customer.total_purchases || 0).toFixed(2)} {t.currency}
                          </TableCell>
                          <TableCell className={`text-center font-medium ${customer.balance > 0 ? 'text-amber-600' : ''}`}>
                            {(customer.balance || 0).toFixed(2)} {t.currency}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {customer.last_purchase_date 
                              ? (() => {
                                  const d = new Date(customer.last_purchase_date);
                                  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
                                })()
                              : '-'
                            }
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              {customer.phone && (
                                customerIsBlacklisted ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-green-600"
                                    onClick={() => handleRemoveFromBlacklist(customer.phone)}
                                    title={language === 'ar' ? 'إزالة من القائمة السوداء' : 'Retirer de la liste noire'}
                                  >
                                    <ShieldOff className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-600"
                                    onClick={() => { setBlacklistCustomer(customer); setBlacklistDialogOpen(true); }}
                                    title={language === 'ar' ? 'إضافة للقائمة السوداء' : 'Ajouter à la liste noire'}
                                  >
                                    <Shield className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                              <PrintButton docType="customer" record={customer} className="h-8 w-8 p-0" />
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(customer)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive"
                                onClick={() => { setSelectedCustomer(customer); setDeleteDialogOpen(true); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          /* Grid View - Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedCustomers
              .filter(customer => !showBlacklistOnly || isBlacklisted(customer.phone))
              .map(customer => {
                const customerIsBlacklisted = isBlacklisted(customer.phone);
                return (
                  <Card 
                    key={customer.id} 
                    className={`hover:shadow-md transition-shadow ${customerIsBlacklisted ? 'border-red-300 bg-red-50/50' : customer.customer_type === 'vip' ? 'border-amber-300 bg-amber-50/30' : ''}`} 
                    data-testid={`customer-card-${customer.id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-lg">{customer.name}</h3>
                            {customer.customer_type === 'vip' && (
                              <Badge className="bg-amber-100 text-amber-700 text-xs">VIP</Badge>
                            )}
                            {customer.customer_type === 'new' && (
                              <Badge className="bg-blue-100 text-blue-700 text-xs">{language === 'ar' ? 'جديد' : 'Nouveau'}</Badge>
                            )}
                            {customerIsBlacklisted && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <Ban className="h-3 w-3" />
                                {language === 'ar' ? 'محظور' : 'Bloqué'}
                              </Badge>
                            )}
                          </div>
                          {customer.phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                              <Phone className="h-4 w-4" />
                              <span dir="ltr">{customer.phone}</span>
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Mail className="h-4 w-4" />
                              <span>{customer.email}</span>
                            </div>
                          )}
                          {customer.address && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <MapPin className="h-4 w-4" />
                              <span>{customer.address}</span>
                            </div>
                          )}
                          {customer.special_discount > 0 && (
                            <div className="mt-2">
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                {language === 'ar' ? `خصم ${customer.special_discount}%` : `Remise ${customer.special_discount}%`}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {/* Blacklist Toggle Button */}
                          {customer.phone && (
                            customerIsBlacklisted ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 border-green-300 hover:bg-green-50 gap-1"
                                onClick={() => handleRemoveFromBlacklist(customer.phone)}
                                title={language === 'ar' ? 'إزالة من القائمة السوداء' : 'Retirer de la liste noire'}
                                data-testid={`unblock-customer-${customer.id}`}
                              >
                                <ShieldOff className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-300 hover:bg-red-50 gap-1"
                                onClick={() => { setBlacklistCustomer(customer); setBlacklistDialogOpen(true); }}
                                title={language === 'ar' ? 'إضافة للقائمة السوداء' : 'Ajouter à la liste noire'}
                                data-testid={`block-customer-${customer.id}`}
                              >
                                <Shield className="h-4 w-4" />
                              </Button>
                            )
                          )}
                          <PrintButton docType="customer" record={customer} />
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(customer)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => { setSelectedCustomer(customer); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-4 pt-4 border-t flex-wrap">
                        <div>
                          <p className="text-xs text-muted-foreground">{t.totalPurchases}</p>
                          <p className="font-semibold">{(customer.total_purchases || 0).toFixed(2)} {t.currency}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t.balance}</p>
                          <p className={`font-semibold ${customer.balance > 0 ? 'text-amber-600' : ''}`}>
                            {(customer.balance || 0).toFixed(2)} {t.currency}
                          </p>
                        </div>
                        {customer.max_debt_limit > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">{language === 'ar' ? 'حد الدين' : 'Limite'}</p>
                            <p className={`font-semibold ${customer.balance >= customer.max_debt_limit ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {customer.max_debt_limit.toFixed(2)} {t.currency}
                            </p>
                          </div>
                        )}
                        {customer.last_purchase_date && (
                          <div>
                            <p className="text-xs text-muted-foreground">{language === 'ar' ? 'آخر زيارة' : 'Dernière visite'}</p>
                            <p className="text-sm">{(() => {
                              const d = new Date(customer.last_purchase_date);
                              return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
                            })()}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}

        {/* Pagination */}
        {totalItems > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
            className="mt-6"
          />
        )}

        {/* Add/Edit Dialog - Compact Design */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg">{selectedCustomer ? t.editCustomer : t.addCustomer}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <CustomerForm
                formData={formData}
                setFormData={setFormData}
                language={language}
                t={t}
                customerFamilies={customerFamilies}
                onAddFamily={() => setFamilyDialogOpen(true)}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                  {t.cancel}
                </Button>
                {!selectedCustomer && (
                  <Button 
                    type="button" 
                    variant="outline"
                    size="sm"
                    onClick={() => handleSubmit(null, true)}
                    disabled={saving}
                    className="gap-1"
                    data-testid="save-and-new-customer-btn"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {language === 'ar' ? 'حفظ وجديد' : 'Sauver + Nouveau'}
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={saving} className="gap-1" data-testid="save-customer-btn">
                  <Save className="h-4 w-4" />
                  {saving ? '...' : t.save}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteConfirm}</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedCustomer?.name}
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

        {/* Blacklist Dialog */}
        <Dialog open={blacklistDialogOpen} onOpenChange={setBlacklistDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Ban className="h-5 w-5" />
                {language === 'ar' ? 'إضافة للقائمة السوداء' : 'Ajouter à la liste noire'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="font-medium">{blacklistCustomer?.name}</p>
                <p className="text-sm text-muted-foreground">{blacklistCustomer?.phone}</p>
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'سبب الحظر' : 'Raison du blocage'}</Label>
                <Select value={blacklistReason} onValueChange={setBlacklistReason}>
                  <SelectTrigger data-testid="blacklist-reason-select">
                    <SelectValue placeholder={language === 'ar' ? 'اختر السبب' : 'Choisir la raison'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="عدم الدفع">{language === 'ar' ? 'عدم الدفع' : 'Non-paiement'}</SelectItem>
                    <SelectItem value="سلوك سيء">{language === 'ar' ? 'سلوك سيء' : 'Mauvais comportement'}</SelectItem>
                    <SelectItem value="احتيال">{language === 'ar' ? 'احتيال' : 'Fraude'}</SelectItem>
                    <SelectItem value="إرجاع متكرر">{language === 'ar' ? 'إرجاع متكرر' : 'Retours fréquents'}</SelectItem>
                    <SelectItem value="أخرى">{language === 'ar' ? 'أخرى' : 'Autre'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => { 
                    setBlacklistDialogOpen(false); 
                    setBlacklistReason(''); 
                    setBlacklistCustomer(null); 
                  }}
                >
                  {t.cancel}
                </Button>
                <Button 
                  onClick={handleAddToBlacklist}
                  className="bg-red-600 hover:bg-red-700 gap-2"
                  disabled={!blacklistReason}
                  data-testid="confirm-blacklist-btn"
                >
                  <Ban className="h-4 w-4" />
                  {language === 'ar' ? 'تأكيد الحظر' : 'Confirmer le blocage'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Family Dialog */}
        <Dialog open={familyDialogOpen} onOpenChange={setFamilyDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {language === 'ar' ? 'إضافة عائلة زبائن جديدة' : 'Ajouter une nouvelle famille'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'اسم العائلة' : 'Nom de la famille'} *</Label>
                <Input
                  value={newFamilyName}
                  onChange={(e) => setNewFamilyName(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: زبائن VIP' : 'Ex: Clients VIP'}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setFamilyDialogOpen(false); setNewFamilyName(''); }}>
                  {t.cancel}
                </Button>
                <Button onClick={handleAddFamily} disabled={savingFamily || !newFamilyName.trim()}>
                  <Plus className="h-4 w-4 me-1" />
                  {language === 'ar' ? 'إضافة' : 'Ajouter'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
