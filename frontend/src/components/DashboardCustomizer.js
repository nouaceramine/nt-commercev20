import { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { 
  GripVertical, 
  Settings, 
  Eye, 
  EyeOff,
  RotateCcw
} from 'lucide-react';

const DEFAULT_WIDGETS = [
  { id: 'stats', name_ar: 'الإحصائيات العامة', name_fr: 'Statistiques générales', visible: true, order: 0 },
  { id: 'profit', name_ar: 'الأرباح الشهرية', name_fr: 'Profits mensuels', visible: true, order: 1 },
  { id: 'cashBoxes', name_ar: 'إدارة المال', name_fr: 'Gestion de trésorerie', visible: true, order: 2 },
  { id: 'notifications', name_ar: 'الإشعارات الذكية', name_fr: 'Notifications intelligentes', visible: true, order: 3 },
  { id: 'recentProducts', name_ar: 'أحدث المنتجات', name_fr: 'Produits récents', visible: true, order: 4 },
];

function SortableItem({ widget, language, onToggle }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div {...attributes} {...listeners}>
        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
      </div>
      <span className="flex-1 font-medium">
        {language === 'ar' ? widget.name_ar : widget.name_fr}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onToggle(widget.id)}
        className={widget.visible ? 'text-primary' : 'text-muted-foreground'}
      >
        {widget.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function DashboardCustomizer({ isOpen, onClose, onSave }) {
  const { language } = useLanguage();
  const [widgets, setWidgets] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const saved = localStorage.getItem('dashboardWidgets');
    if (saved) {
      setWidgets(JSON.parse(saved));
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over?.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, index) => ({ ...item, order: index }));
      });
    }
  };

  const toggleWidget = (widgetId) => {
    setWidgets(widgets.map(w => 
      w.id === widgetId ? { ...w, visible: !w.visible } : w
    ));
  };

  const handleSave = () => {
    localStorage.setItem('dashboardWidgets', JSON.stringify(widgets));
    onSave(widgets);
    onClose();
  };

  const resetToDefault = () => {
    setWidgets(DEFAULT_WIDGETS);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {language === 'ar' ? 'تخصيص لوحة التحكم' : 'Personnaliser le tableau de bord'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            {language === 'ar' 
              ? 'اسحب العناصر لإعادة ترتيبها أو أخفِها/أظهرها'
              : 'Glissez pour réorganiser ou masquez/affichez les widgets'}
          </p>
          
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={widgets.map(w => w.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {widgets.sort((a, b) => a.order - b.order).map((widget) => (
                  <SortableItem 
                    key={widget.id} 
                    widget={widget} 
                    language={language}
                    onToggle={toggleWidget}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={resetToDefault} className="flex-1 gap-2">
              <RotateCcw className="h-4 w-4" />
              {language === 'ar' ? 'استعادة الافتراضي' : 'Réinitialiser'}
            </Button>
            <Button onClick={handleSave} className="flex-1">
              {language === 'ar' ? 'حفظ' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  
  useEffect(() => {
    const saved = localStorage.getItem('dashboardWidgets');
    if (saved) {
      setWidgets(JSON.parse(saved));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  const isWidgetVisible = (widgetId) => {
    const widget = widgets.find(w => w.id === widgetId);
    return widget ? widget.visible : true;
  };
  
  const getWidgetOrder = (widgetId) => {
    const widget = widgets.find(w => w.id === widgetId);
    return widget ? widget.order : 999;
  };
  
  return { widgets, setWidgets, isWidgetVisible, getWidgetOrder };
}

export default DashboardCustomizer;
