import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Check, X } from 'lucide-react';
import apiClient from '../lib/apiClient';
import { toast } from 'sonner';
import { defaultMenuSections } from '../config/sidebarMenu';

// One draggable sub-item row
function SortableItem({ id, label, Icon, data }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-2 rounded-md bg-muted/40 hover:bg-muted text-sm select-none"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {Icon && <Icon className="h-4 w-4 flex-shrink-0 opacity-70" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

// One draggable section card containing its items
function SortableSection({ section, language }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `S::${section.id}`,
    data: { type: 'section', sectionId: section.id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const SectionIcon = section.icon;
  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card mb-2">
      <div className="flex items-center gap-2 px-2 py-2 border-b bg-muted/30 rounded-t-lg">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        {SectionIcon && <SectionIcon className="h-4 w-4" />}
        <span className="text-sm font-bold truncate">{section.title}</span>
      </div>
      <div className="p-2 space-y-1">
        <SortableContext
          items={section.items.map(it => `I::${section.id}::${it.path}`)}
          strategy={verticalListSortingStrategy}
        >
          {section.items.map(it => (
            <SortableItem
              key={`I::${section.id}::${it.path}`}
              id={`I::${section.id}::${it.path}`}
              label={it.label}
              Icon={it.icon}
              data={{ type: 'item', sectionId: section.id, path: it.path }}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export function SidebarReorder({ navSections, language, onClose, onSaved }) {
  const isRTL = language === 'ar';
  const [sections, setSections] = useState(() =>
    navSections.map(s => ({
      id: s.id,
      title: s.title,
      icon: s.icon,
      items: (s.items || []).map(it => ({ path: it.path, label: it.label, icon: it.icon })),
    }))
  );
  const [saving, setSaving] = useState(false);
  // The currently persisted sidebar order (full fidelity: visibility + custom
  // bilingual metadata + hidden/feature-gated items). We MERGE onto this so
  // inline reorder only changes ORDER and never resets visibility or loses
  // custom sections/items. Null until loaded; falls back to canonical.
  const [savedOrder, setSavedOrder] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // True only when the GET actually FAILED (network/server error), as opposed to
  // a successful response with no saved order yet. We block saving on a real
  // failure so a transient error can't overwrite the user's saved order with the
  // canonical fallback.
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/settings/sidebar-order')
      .then(res => {
        const order = res?.data?.sidebar_order;
        if (active && Array.isArray(order) && order.length && order[0]?.items) {
          setSavedOrder(order);
        }
      })
      .catch(() => { if (active) setLoadError(true); /* don't fall back blindly */ })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const a = active.data.current;
    const o = over.data.current;
    if (!a || !o) return;

    if (a.type === 'section' && o.type === 'section') {
      if (a.sectionId !== o.sectionId) {
        setSections(prev => {
          const oldIndex = prev.findIndex(s => s.id === a.sectionId);
          const newIndex = prev.findIndex(s => s.id === o.sectionId);
          return arrayMove(prev, oldIndex, newIndex);
        });
      }
      return;
    }

    // Item reorder within the same section only
    if (a.type === 'item' && o.type === 'item' && a.sectionId === o.sectionId) {
      setSections(prev =>
        prev.map(s => {
          if (s.id !== a.sectionId) return s;
          const oldIndex = s.items.findIndex(i => i.path === a.path);
          const newIndex = s.items.findIndex(i => i.path === o.path);
          if (oldIndex === -1 || newIndex === -1) return s;
          return { ...s, items: arrayMove(s.items, oldIndex, newIndex) };
        })
      );
    }
  };

  // Build the persisted payload by MERGING the new order onto the existing saved
  // order (or canonical if nothing saved yet). This only changes ORDER: it
  // carries forward each item/section's saved `visible` flag and custom bilingual
  // metadata, and preserves hidden / feature-gated / custom items & sections that
  // aren't part of the inline reorder UI.
  const buildPayload = () => {
    const canonById = {};
    defaultMenuSections.forEach(s => { canonById[s.id] = s; });

    const base = (Array.isArray(savedOrder) && savedOrder.length && savedOrder[0]?.items)
      ? savedOrder
      : defaultMenuSections;
    const baseById = {};
    base.forEach(s => { baseById[s.id] = s; });

    const cloneItem = (it) => ({
      id: it.id || it.path,
      path: it.path,
      icon: it.icon || 'Package',
      labelAr: it.labelAr,
      labelFr: it.labelFr,
      visible: it.visible !== false,
    });

    // uiItemPaths: new order of the visible items as arranged in the UI (or null
    // when this section wasn't shown in the UI — then keep base order untouched).
    const buildSection = (sectionId, uiItemPaths) => {
      const def = baseById[sectionId] || canonById[sectionId];
      if (!def) return null;
      const baseItems = def.items || [];
      const byPath = {};
      baseItems.forEach(i => { byPath[i.path] = i; });
      const canonByPath = {};
      (canonById[sectionId]?.items || []).forEach(i => { canonByPath[i.path] = i; });

      let orderedItems;
      if (uiItemPaths && uiItemPaths.length) {
        const uiSet = new Set(uiItemPaths);
        const head = uiItemPaths.map(p => {
          const src = byPath[p] || canonByPath[p];
          return src
            ? { ...cloneItem(src), visible: true }
            : { id: p, path: p, icon: 'Package', labelAr: p, labelFr: p, visible: true };
        });
        // Items not in the UI (hidden / feature-gated) keep their order & flags.
        const tail = baseItems.filter(i => !uiSet.has(i.path)).map(cloneItem);
        orderedItems = [...head, ...tail];
      } else {
        orderedItems = baseItems.map(cloneItem);
      }

      return {
        id: def.id,
        titleAr: def.titleAr,
        titleFr: def.titleFr,
        icon: def.icon || 'Package',
        visible: def.visible !== false,
        isCustom: def.isCustom || false,
        items: orderedItems,
      };
    };

    const uiSectionIds = sections.map(s => s.id);
    const uiItemPathsBySection = {};
    sections.forEach(s => { uiItemPathsBySection[s.id] = s.items.map(i => i.path); });

    const payload = [];
    // 1) Sections shown in the UI, in their new order.
    uiSectionIds.forEach(id => {
      const sec = buildSection(id, uiItemPathsBySection[id]);
      if (sec) payload.push(sec);
    });
    // 2) Base sections not shown in the UI (hidden / feature-gated) — preserved.
    base.forEach(s => {
      if (!uiSectionIds.includes(s.id)) {
        const sec = buildSection(s.id, null);
        if (sec) payload.push(sec);
      }
    });
    // 3) Canonical sections never saved before (newly added) — append at end.
    defaultMenuSections.forEach(s => {
      if (!uiSectionIds.includes(s.id) && !baseById[s.id]) {
        const sec = buildSection(s.id, null);
        if (sec) payload.push(sec);
      }
    });
    return payload;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiClient.put('/settings/sidebar-order', buildPayload());
      window.dispatchEvent(new CustomEvent('sidebarOrderChanged'));
      toast.success(isRTL ? 'تم حفظ ترتيب القائمة' : 'Ordre du menu enregistré');
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      console.error('Error saving sidebar order:', e);
      toast.error(isRTL ? 'تعذّر حفظ الترتيب' : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="p-2 border-b">
        <p className="text-xs text-muted-foreground px-1 mb-2">
          {isRTL
            ? 'اسحب من المقبض ⠿ لإعادة الترتيب، ثم احفظ.'
            : 'Glissez via la poignée ⠿ pour réorganiser, puis enregistrez.'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !loaded || loadError}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {saving
              ? (isRTL ? 'جارٍ الحفظ...' : 'Enregistrement...')
              : !loaded
                ? (isRTL ? 'جارٍ التحميل...' : 'Chargement...')
                : loadError
                  ? (isRTL ? 'تعذّر التحميل' : 'Échec du chargement')
                  : (isRTL ? 'حفظ' : 'Enregistrer')}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex items-center justify-center gap-1 px-3 py-2 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            {isRTL ? 'إلغاء' : 'Annuler'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={sections.map(s => `S::${s.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {sections.map(section => (
              <SortableSection key={`S::${section.id}`} section={section} language={language} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

export default SidebarReorder;
