import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { defaultMenuSections } from '../config/sidebarMenu';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import {
  GripVertical,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Users,
  CreditCard,
  Wallet,
  BarChart3,
  Settings,
  Bell,
  Wrench,
  Save,
  RotateCcw,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Receipt,
  FolderTree,
  Warehouse,
  ClipboardList,
  QrCode,
  DollarSign,
  ShoppingBag,
  Clock,
  Smartphone,
  Store,
  Shield,
  Key,
  Plus,
  Trash2,
  Edit,
  MoveVertical,
  Folder,
  Star,
  Briefcase,
  Home,
  FileText,
  Globe,
  Heart,
  Zap,
  Box,
  Award
} from 'lucide-react';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';

// Available icons for sections
const availableIcons = [
  { id: 'LayoutDashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'Package', icon: Package, label: 'Package' },
  { id: 'ShoppingCart', icon: ShoppingCart, label: 'Cart' },
  { id: 'Wallet', icon: Wallet, label: 'Wallet' },
  { id: 'Users', icon: Users, label: 'Users' },
  { id: 'Wrench', icon: Wrench, label: 'Tools' },
  { id: 'Settings', icon: Settings, label: 'Settings' },
  { id: 'BarChart3', icon: BarChart3, label: 'Chart' },
  { id: 'Folder', icon: Folder, label: 'Folder' },
  { id: 'Star', icon: Star, label: 'Star' },
  { id: 'Briefcase', icon: Briefcase, label: 'Business' },
  { id: 'Home', icon: Home, label: 'Home' },
  { id: 'FileText', icon: FileText, label: 'Document' },
  { id: 'Globe', icon: Globe, label: 'Globe' },
  { id: 'Heart', icon: Heart, label: 'Heart' },
  { id: 'Zap', icon: Zap, label: 'Lightning' },
  { id: 'Box', icon: Box, label: 'Box' },
];

// Icon mapping
const iconMap = {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, CreditCard, Wallet,
  BarChart3, Settings, Bell, Wrench, Receipt, FolderTree, Warehouse,
  ClipboardList, QrCode, DollarSign, ShoppingBag, Clock, Smartphone, Store, Shield, Key,
  Folder, Star, Briefcase, Home, FileText, Globe, Heart, Zap, Box, Award
};


// Draggable Item Component
function DraggableItem({ item, language, onToggleVisibility, sectionId, onMoveItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: `item-${sectionId}-${item.id}`,
    data: { type: 'item', sectionId, item }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const IconComponent = iconMap[item.icon] || Package;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 bg-muted/50 rounded-lg ${
        isDragging ? 'shadow-md ring-2 ring-primary/50 z-50' : ''
      } ${!item.visible ? 'opacity-50' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
        title={language === 'ar' ? 'اسحب للترتيب أو النقل لقسم آخر' : 'Glissez pour réorganiser ou déplacer'}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      
      <IconComponent className={`h-4 w-4 ${item.visible ? 'text-primary' : 'text-muted-foreground'}`} />
      
      <span className={`flex-1 text-sm ${!item.visible ? 'text-muted-foreground line-through' : ''}`}>
        {language === 'ar' ? item.labelAr : item.labelFr}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onMoveItem(sectionId, item.id)}
        title={language === 'ar' ? 'نقل إلى قسم آخر' : 'Déplacer vers une autre section'}
      >
        <MoveVertical className="h-3 w-3" />
      </Button>
      
      <Switch
        checked={item.visible}
        onCheckedChange={() => onToggleVisibility(sectionId, item.id)}
        className="scale-75"
      />
    </div>
  );
}

// Droppable Section Component
function DroppableSection({ 
  section, 
  language, 
  onToggleVisibility, 
  onToggleSectionVisibility, 
  expandedSections, 
  toggleExpanded,
  onMoveItem,
  onDeleteSection,
  onEditSection,
  menuSections
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ 
    id: `section-${section.id}`,
    data: { type: 'section', section }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const IconComponent = iconMap[section.icon] || Package;
  const isExpanded = expandedSections.includes(section.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-xl overflow-hidden bg-card ${
        isDragging ? 'shadow-lg ring-2 ring-primary z-50' : ''
      } ${isOver ? 'ring-2 ring-green-500 bg-green-50/10' : ''}
      ${!section.visible ? 'opacity-60' : ''}`}
      data-section-id={section.id}
    >
      {/* Section Header */}
      <div className="flex items-center gap-3 p-4 bg-muted/30">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </button>
        
        <div className={`p-2 rounded-lg ${section.visible ? 'bg-primary/10' : 'bg-muted'}`}>
          <IconComponent className={`h-5 w-5 ${section.visible ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className={`font-medium ${!section.visible ? 'text-muted-foreground' : ''}`}>
              {language === 'ar' ? section.titleAr : section.titleFr}
            </p>
            {section.isCustom && (
              <Badge variant="secondary" className="text-xs">
                {language === 'ar' ? 'مخصص' : 'Personnalisé'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {section.items.filter(i => i.visible).length} / {section.items.length} {language === 'ar' ? 'عنصر' : 'éléments'}
          </p>
        </div>
        
        <div className="flex items-center gap-1">
          {section.isCustom && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onEditSection(section)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={() => onDeleteSection(section.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Switch
            checked={section.visible}
            onCheckedChange={() => onToggleSectionVisibility(section.id)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleExpanded(section.id)}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      
      {/* Section Items */}
      {isExpanded && section.visible && (
        <div className="p-3 space-y-2 border-t bg-background/50 min-h-[60px]">
          <SortableContext
            items={section.items.map(item => `item-${section.id}-${item.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {section.items.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                {language === 'ar' ? 'اسحب العناصر هنا' : 'Glissez des éléments ici'}
              </div>
            ) : (
              section.items.map((item) => (
                <DraggableItem
                  key={item.id}
                  item={item}
                  language={language}
                  onToggleVisibility={onToggleVisibility}
                  sectionId={section.id}
                  onMoveItem={onMoveItem}
                />
              ))
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

export default function SidebarSettingsPage() {
  const { language, isRTL } = useLanguage();
  const [menuSections, setMenuSections] = useState(defaultMenuSections);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedSections, setExpandedSections] = useState(['main-sales', 'inventory', 'customers-finance-reports', 'services-settings']);
  
  // Dialogs
  const [newSectionDialog, setNewSectionDialog] = useState(false);
  const [editSectionDialog, setEditSectionDialog] = useState(false);
  const [moveItemDialog, setMoveItemDialog] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  const [moveItemData, setMoveItemData] = useState({ fromSection: '', itemId: '' });
  
  // New/Edit section form
  const [sectionForm, setSectionForm] = useState({
    titleAr: '',
    titleFr: '',
    icon: 'Folder'
  });

  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const t = {
    ar: {
      title: 'ترتيب القائمة الجانبية',
      description: 'اسحب الأقسام والعناصر لتغيير ترتيبها، أو انقل العناصر بين الأقسام',
      save: 'حفظ الترتيب',
      reset: 'إعادة الترتيب الافتراضي',
      saved: 'تم حفظ الترتيب بنجاح',
      resetSuccess: 'تم إعادة الترتيب الافتراضي',
      addSection: 'إضافة قسم جديد',
      editSection: 'تعديل القسم',
      sectionNameAr: 'اسم القسم (عربي)',
      sectionNameFr: 'اسم القسم (فرنسي)',
      sectionIcon: 'أيقونة القسم',
      create: 'إنشاء',
      update: 'تحديث',
      cancel: 'إلغاء',
      deleteSection: 'حذف القسم',
      confirmDelete: 'هل أنت متأكد من حذف هذا القسم؟ سيتم نقل عناصره للقسم الأول.',
      moveItem: 'نقل العنصر',
      moveToSection: 'نقل إلى قسم',
      move: 'نقل',
      expandAll: 'فتح الكل',
      collapseAll: 'إغلاق الكل',
      dragHint: 'اسحب للترتيب أو النقل'
    },
    fr: {
      title: 'Organiser le menu latéral',
      description: 'Glissez les sections et éléments pour les réorganiser, ou déplacez les éléments entre sections',
      save: 'Enregistrer',
      reset: 'Réinitialiser',
      saved: 'Ordre enregistré avec succès',
      resetSuccess: 'Ordre par défaut restauré',
      addSection: 'Ajouter une section',
      editSection: 'Modifier la section',
      sectionNameAr: 'Nom (arabe)',
      sectionNameFr: 'Nom (français)',
      sectionIcon: 'Icône',
      create: 'Créer',
      update: 'Mettre à jour',
      cancel: 'Annuler',
      deleteSection: 'Supprimer la section',
      confirmDelete: 'Êtes-vous sûr de vouloir supprimer cette section? Ses éléments seront déplacés.',
      moveItem: 'Déplacer l\'élément',
      moveToSection: 'Déplacer vers',
      move: 'Déplacer',
      expandAll: 'Tout ouvrir',
      collapseAll: 'Tout fermer',
      dragHint: 'Glissez pour réorganiser'
    }
  };

  const texts = t[language] || t.ar;

  useEffect(() => {
    fetchSidebarOrder();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge saved sections with default sections to include new sections
  const mergeSectionsWithDefault = (savedSections) => {
    const savedIds = new Set(savedSections.map(s => s.id));
    const newSections = defaultMenuSections.filter(s => !savedIds.has(s.id));
    
    // Also check for missing items within existing sections
    const mergedSections = savedSections.map(savedSection => {
      const defaultSection = defaultMenuSections.find(d => d.id === savedSection.id);
      if (defaultSection) {
        const savedItemIds = new Set(savedSection.items.map(i => i.id));
        const newItems = defaultSection.items.filter(i => !savedItemIds.has(i.id));
        if (newItems.length > 0) {
          return {
            ...savedSection,
            items: [...savedSection.items, ...newItems]
          };
        }
      }
      return savedSection;
    });
    
    // Add completely new sections at the end
    return [...mergedSections, ...newSections];
  };

  const fetchSidebarOrder = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/settings/sidebar-order`);
      
      if (response.data.sidebar_order && Array.isArray(response.data.sidebar_order) && response.data.sidebar_order.length > 0) {
        if (response.data.sidebar_order[0].items) {
          // Merge saved sections with default to include any new sections
          const mergedSections = mergeSectionsWithDefault(response.data.sidebar_order);
          setMenuSections(mergedSections);
        }
      }
    } catch (error) {
      console.error('Error fetching sidebar order:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data.current;
    const overId = over.id;

    // Handle section reordering
    if (activeData?.type === 'section' && overId.toString().startsWith('section-')) {
      const activeSectionId = active.id.toString().replace('section-', '');
      const overSectionId = overId.toString().replace('section-', '');
      
      if (activeSectionId !== overSectionId) {
        setMenuSections((sections) => {
          const oldIndex = sections.findIndex(s => s.id === activeSectionId);
          const newIndex = sections.findIndex(s => s.id === overSectionId);
          setHasChanges(true);
          return arrayMove(sections, oldIndex, newIndex);
        });
      }
    }
    
    // Handle item reordering within same section
    if (activeData?.type === 'item') {
      const activeSectionId = activeData.sectionId;
      const activeItemId = activeData.item.id;
      // Use the drop target's sortable data (robust to ids containing hyphens)
      const overData = over.data.current;

      // Check if dropping on another item in any section
      if (overData?.type === 'item') {
        const overSectionId = overData.sectionId;
        const overItemId = overData.item.id;
        
        if (activeSectionId === overSectionId) {
          // Same section - reorder
          setMenuSections(sections =>
            sections.map(section => {
              if (section.id === activeSectionId) {
                const oldIndex = section.items.findIndex(i => i.id === activeItemId);
                const newIndex = section.items.findIndex(i => i.id === overItemId);
                return {
                  ...section,
                  items: arrayMove(section.items, oldIndex, newIndex)
                };
              }
              return section;
            })
          );
        } else {
          // Different section - move item
          moveItemBetweenSections(activeSectionId, overSectionId, activeItemId, overItemId);
        }
        setHasChanges(true);
      }
      // Check if dropping on a section (move to end of that section)
      else if (overData?.type === 'section') {
        const overSectionId = overData.section.id;
        if (activeSectionId !== overSectionId) {
          moveItemBetweenSections(activeSectionId, overSectionId, activeItemId, null);
          setHasChanges(true);
        }
      }
    }
  };

  const moveItemBetweenSections = (fromSectionId, toSectionId, itemId, beforeItemId) => {
    setMenuSections(sections => {
      let itemToMove = null;
      
      // Find and remove item from source section
      const newSections = sections.map(section => {
        if (section.id === fromSectionId) {
          const itemIndex = section.items.findIndex(i => i.id === itemId);
          if (itemIndex !== -1) {
            itemToMove = section.items[itemIndex];
            return {
              ...section,
              items: section.items.filter(i => i.id !== itemId)
            };
          }
        }
        return section;
      });
      
      // Add item to target section
      if (itemToMove) {
        return newSections.map(section => {
          if (section.id === toSectionId) {
            const newItems = [...section.items];
            if (beforeItemId) {
              const targetIndex = newItems.findIndex(i => i.id === beforeItemId);
              newItems.splice(targetIndex, 0, itemToMove);
            } else {
              newItems.push(itemToMove);
            }
            return { ...section, items: newItems };
          }
          return section;
        });
      }
      
      return newSections;
    });
  };

  const handleToggleItemVisibility = (sectionId, itemId) => {
    setMenuSections(sections =>
      sections.map(section => {
        if (section.id === sectionId) {
          return {
            ...section,
            items: section.items.map(item =>
              item.id === itemId ? { ...item, visible: !item.visible } : item
            )
          };
        }
        return section;
      })
    );
    setHasChanges(true);
  };

  const handleToggleSectionVisibility = (sectionId) => {
    setMenuSections(sections =>
      sections.map(section =>
        section.id === sectionId ? { ...section, visible: !section.visible } : section
      )
    );
    setHasChanges(true);
  };

  const toggleExpanded = (sectionId) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const expandAll = () => setExpandedSections(menuSections.map(s => s.id));
  const collapseAll = () => setExpandedSections([]);

  // Add new section
  const handleAddSection = () => {
    if (!sectionForm.titleAr.trim() || !sectionForm.titleFr.trim()) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Veuillez remplir tous les champs');
      return;
    }

    const newSection = {
      id: `custom-${Date.now()}`,
      titleAr: sectionForm.titleAr,
      titleFr: sectionForm.titleFr,
      icon: sectionForm.icon,
      visible: true,
      isCustom: true,
      items: []
    };

    setMenuSections(prev => [...prev, newSection]);
    setNewSectionDialog(false);
    setSectionForm({ titleAr: '', titleFr: '', icon: 'Folder' });
    setHasChanges(true);
    toast.success(language === 'ar' ? 'تم إضافة القسم' : 'Section ajoutée');
  };

  // Edit section
  const handleEditSection = (section) => {
    setSelectedSection(section);
    setSectionForm({
      titleAr: section.titleAr,
      titleFr: section.titleFr,
      icon: section.icon
    });
    setEditSectionDialog(true);
  };

  const handleUpdateSection = () => {
    if (!sectionForm.titleAr.trim() || !sectionForm.titleFr.trim()) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Veuillez remplir tous les champs');
      return;
    }

    setMenuSections(sections =>
      sections.map(s =>
        s.id === selectedSection.id
          ? { ...s, titleAr: sectionForm.titleAr, titleFr: sectionForm.titleFr, icon: sectionForm.icon }
          : s
      )
    );
    setEditSectionDialog(false);
    setSelectedSection(null);
    setSectionForm({ titleAr: '', titleFr: '', icon: 'Folder' });
    setHasChanges(true);
    toast.success(language === 'ar' ? 'تم تحديث القسم' : 'Section mise à jour');
  };

  // Delete section
  const handleDeleteSection = (sectionId) => {
    if (!window.confirm(texts.confirmDelete)) return;

    setMenuSections(sections => {
      const sectionToDelete = sections.find(s => s.id === sectionId);
      const itemsToMove = sectionToDelete?.items || [];
      
      // Move items to first section
      return sections
        .filter(s => s.id !== sectionId)
        .map((s, index) => {
          if (index === 0 && itemsToMove.length > 0) {
            return { ...s, items: [...s.items, ...itemsToMove] };
          }
          return s;
        });
    });
    setHasChanges(true);
    toast.success(language === 'ar' ? 'تم حذف القسم' : 'Section supprimée');
  };

  // Move item dialog
  const openMoveItemDialog = (fromSection, itemId) => {
    setMoveItemData({ fromSection, itemId });
    setMoveItemDialog(true);
  };

  const handleMoveItemConfirm = (toSectionId) => {
    moveItemBetweenSections(moveItemData.fromSection, toSectionId, moveItemData.itemId, null);
    setMoveItemDialog(false);
    setMoveItemData({ fromSection: '', itemId: '' });
    setHasChanges(true);
    toast.success(language === 'ar' ? 'تم نقل العنصر' : 'Élément déplacé');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/settings/sidebar-order`, menuSections);
      
      localStorage.setItem('sidebarOrder', JSON.stringify(menuSections));
      toast.success(texts.saved);
      setHasChanges(false);
      window.dispatchEvent(new CustomEvent('sidebarOrderChanged'));
    } catch (error) {
      toast.error(language === 'ar' ? 'حدث خطأ' : 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد؟' : 'Êtes-vous sûr?')) return;
    setMenuSections(defaultMenuSections);
    localStorage.removeItem('sidebarOrder');
    setHasChanges(true);
    toast.success(texts.resetSuccess);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const movingItem = moveItemData.itemId 
    ? menuSections.find(s => s.id === moveItemData.fromSection)?.items.find(i => i.id === moveItemData.itemId)
    : null;

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl mx-auto" data-testid="sidebar-settings-page">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GripVertical className="h-5 w-5" />
                  {texts.title}
                </CardTitle>
                <CardDescription className="mt-1">{texts.description}</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={expandAll}>
                  {texts.expandAll}
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  {texts.collapseAll}
                </Button>
                <Button size="sm" onClick={() => setNewSectionDialog(true)} className="gap-1">
                  <Plus className="h-4 w-4" />
                  {texts.addSection}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sortable Sections */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={menuSections.map(s => `section-${s.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {menuSections.map((section) => (
                    <DroppableSection
                      key={section.id}
                      section={section}
                      language={language}
                      onToggleVisibility={handleToggleItemVisibility}
                      onToggleSectionVisibility={handleToggleSectionVisibility}
                      expandedSections={expandedSections}
                      toggleExpanded={toggleExpanded}
                      onMoveItem={openMoveItemDialog}
                      onDeleteSection={handleDeleteSection}
                      onEditSection={handleEditSection}
                      menuSections={menuSections}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleReset}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                {texts.reset}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="gap-2 flex-1"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {texts.save}
                {hasChanges && <Badge variant="secondary" className="ms-2">*</Badge>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Add Section Dialog */}
        <Dialog open={newSectionDialog} onOpenChange={setNewSectionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                {texts.addSection}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{texts.sectionNameAr} *</Label>
                <Input
                  value={sectionForm.titleAr}
                  onChange={(e) => setSectionForm(f => ({ ...f, titleAr: e.target.value }))}
                  placeholder="مثال: المفضلة"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label>{texts.sectionNameFr} *</Label>
                <Input
                  value={sectionForm.titleFr}
                  onChange={(e) => setSectionForm(f => ({ ...f, titleFr: e.target.value }))}
                  placeholder="Ex: Favoris"
                />
              </div>
              <div className="space-y-2">
                <Label>{texts.sectionIcon}</Label>
                <div className="grid grid-cols-6 gap-2">
                  {availableIcons.map(({ id, icon: Icon }) => (
                    <Button
                      key={id}
                      type="button"
                      variant={sectionForm.icon === id ? 'default' : 'outline'}
                      size="sm"
                      className="h-10 w-10 p-0"
                      onClick={() => setSectionForm(f => ({ ...f, icon: id }))}
                    >
                      <Icon className="h-5 w-5" />
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setNewSectionDialog(false)}>
                  {texts.cancel}
                </Button>
                <Button onClick={handleAddSection}>
                  <Plus className="h-4 w-4 me-1" />
                  {texts.create}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Section Dialog */}
        <Dialog open={editSectionDialog} onOpenChange={setEditSectionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                {texts.editSection}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{texts.sectionNameAr} *</Label>
                <Input
                  value={sectionForm.titleAr}
                  onChange={(e) => setSectionForm(f => ({ ...f, titleAr: e.target.value }))}
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label>{texts.sectionNameFr} *</Label>
                <Input
                  value={sectionForm.titleFr}
                  onChange={(e) => setSectionForm(f => ({ ...f, titleFr: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{texts.sectionIcon}</Label>
                <div className="grid grid-cols-6 gap-2">
                  {availableIcons.map(({ id, icon: Icon }) => (
                    <Button
                      key={id}
                      type="button"
                      variant={sectionForm.icon === id ? 'default' : 'outline'}
                      size="sm"
                      className="h-10 w-10 p-0"
                      onClick={() => setSectionForm(f => ({ ...f, icon: id }))}
                    >
                      <Icon className="h-5 w-5" />
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditSectionDialog(false)}>
                  {texts.cancel}
                </Button>
                <Button onClick={handleUpdateSection}>
                  <Save className="h-4 w-4 me-1" />
                  {texts.update}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Move Item Dialog */}
        <Dialog open={moveItemDialog} onOpenChange={setMoveItemDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MoveVertical className="h-5 w-5" />
                {texts.moveItem}
              </DialogTitle>
              <DialogDescription>
                {movingItem && (language === 'ar' ? movingItem.labelAr : movingItem.labelFr)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Label>{texts.moveToSection}</Label>
              <div className="space-y-2">
                {menuSections
                  .filter(s => s.id !== moveItemData.fromSection)
                  .map(section => {
                    const Icon = iconMap[section.icon] || Package;
                    return (
                      <Button
                        key={section.id}
                        variant="outline"
                        className="w-full justify-start gap-3"
                        onClick={() => handleMoveItemConfirm(section.id)}
                      >
                        <Icon className="h-4 w-4" />
                        {language === 'ar' ? section.titleAr : section.titleFr}
                      </Button>
                    );
                  })}
              </div>
              <div className="flex justify-end pt-4">
                <Button variant="outline" onClick={() => setMoveItemDialog(false)}>
                  {texts.cancel}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
