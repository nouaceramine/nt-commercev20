/**
 * Visual Template Editor
 * Three-panel layout:
 *   Left  — block-type palette (drag from here onto canvas)
 *   Center — interactive paper canvas (drag blocks here to place/reorder; resize with width handles)
 *   Right  — properties panel for selected block
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable, useDraggable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import {
  BLOCK_TYPES, FIELD_BINDINGS, createBlock,
} from '../../lib/customTemplateRenderer';
import { DOC_LABELS } from '../../lib/printDocuments';
import {
  Save, ArrowRight, Trash2, ChevronUp, ChevronDown, GripVertical,
  Plus, Palette, Copy, RefreshCw, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const PAPER_OPTIONS = [
  { value: 58, label: '58mm (حراري صغير)' },
  { value: 80, label: '80mm (حراري قياسي)' },
  { value: 210, label: 'A4 (صفحة كاملة)' },
];

const WIDTH_PRESETS = [
  { value: 25, label: '¼' },
  { value: 50, label: '½' },
  { value: 75, label: '¾' },
  { value: 100, label: '■' },
];

// ── Draggable palette item (source) ───────────────────────────────────────────
function PaletteItem({ bt, language }) {
  const ar = language === 'ar';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${bt.type}`,
    data: { source: 'palette', blockType: bt.type },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[11px] cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging
          ? 'opacity-30 border-primary/40'
          : 'hover:bg-primary/10 hover:text-primary hover:border-primary/20 border-transparent'
      }`}
    >
      <span className="text-sm flex-shrink-0">{bt.icon}</span>
      <span className="truncate">{ar ? bt.ar : bt.fr}</span>
    </div>
  );
}

// ── Canvas block visual render (what the block looks like on the paper) ───────
function BlockVisual({ block, branding, accentColor, isA4, language }) {
  const ar = language === 'ar';
  const s = block.style || {};
  const style = {
    fontSize: `${s.fontSize || 12}px`,
    fontWeight: s.fontWeight || 'normal',
    textAlign: s.textAlign || (ar ? 'right' : 'left'),
    color: s.color || '#111',
    direction: ar ? 'rtl' : 'ltr',
  };

  switch (block.type) {
    case 'logo': {
      const logoUrl = branding?.logo_url;
      return (
        <div className="flex justify-center py-1">
          {logoUrl
            ? <img src={logoUrl} alt="logo" className="max-h-10 object-contain" />
            : <div className="w-10 h-10 bg-gray-100 border rounded flex items-center justify-center text-gray-400 text-xs">🖼</div>
          }
        </div>
      );
    }
    case 'store_name':
      return <div style={{ ...style, color: accentColor, fontWeight: 'bold', textAlign: 'center', fontSize: `${s.fontSize || 16}px` }}>{branding?.name || 'اسم المتجر'}</div>;
    case 'text':
      return <div style={style}>{block.content || <span className="text-gray-400 italic text-xs">{ar ? '(نص فارغ)' : '(texte vide)'}</span>}</div>;
    case 'field': {
      const lbl = ar ? block.fieldLabel : (block.fieldLabelFr || block.fieldLabel);
      return (
        <div style={{ ...style, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: '#777' }}>{lbl}</span>
          <span style={{ fontWeight: 'bold', color: '#555' }}>----</span>
        </div>
      );
    }
    case 'items_table': {
      const cols = ar
        ? ['المنتج', 'الكمية', 'السعر', 'الإجمالي']
        : ['Produit', 'Qté', 'Prix', 'Total'];
      return (
        <div style={style}>
          <div className="grid grid-cols-4 gap-1 py-1 px-1 rounded-sm text-white text-[10px]" style={{ background: accentColor }}>
            {cols.map(c => <span key={c}>{c}</span>)}
          </div>
          {[1, 2].map(i => (
            <div key={i} className="grid grid-cols-4 gap-1 border-b border-gray-100 py-0.5 px-1 text-[10px] text-gray-500">
              <span>----</span><span>1</span><span>--</span><span>--</span>
            </div>
          ))}
        </div>
      );
    }
    case 'totals': {
      const rows = ar
        ? [['المجموع الفرعي', '--'], ['الإجمالي', '--']]
        : [['Sous-total', '--'], ['Total', '--']];
      return (
        <div style={style} className="space-y-0.5">
          {rows.map(([l, v], i) => (
            <div key={i} className="flex justify-between text-[11px]" style={i === rows.length - 1 ? { fontWeight: 'bold', color: accentColor } : {}}>
              <span>{l}</span><span>{v}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'separator':
      return <hr style={{ borderTop: block.separatorStyle === 'solid' ? '1px solid #999' : '1px dashed #aaa', margin: '2px 0' }} />;
    case 'spacer':
      return <div style={{ height: `${block.height || 12}px` }} className="bg-gray-50 border border-dashed border-gray-200 rounded" />;
    case 'barcode':
      return (
        <div className="flex flex-col items-center gap-0.5">
          <div className="text-[10px] text-gray-500">{ar ? block.fieldLabel : (block.fieldLabelFr || block.fieldLabel)}</div>
          <div className="font-mono text-[9px] tracking-widest text-gray-800">▐▐▌▌▐▌▌▐▐▌▐▐▌▌▐</div>
        </div>
      );
    case 'qr': {
      const size = Math.min(block.qrSize || 60, 80);
      return (
        <div className="flex justify-center">
          <div style={{ width: size, height: size }} className="border border-gray-300 rounded bg-gray-50 flex items-center justify-center text-gray-400 text-xs font-mono">
            QR
          </div>
        </div>
      );
    }
    default:
      return <div className="text-gray-400 text-xs text-center">({block.type})</div>;
  }
}

// ── Sortable block on the canvas ──────────────────────────────────────────────
function CanvasBlock({ block, isSelected, onSelect, onDelete, branding, accentColor, isA4, language }) {
  const ar = language === 'ar';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { source: 'canvas', blockId: block.id },
  });
  const s = block.style || {};
  const wp = s.widthPercent || 100;
  const align = s.blockAlign || 'center';

  const containerStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    marginTop: s.marginTop || 0,
    marginBottom: s.marginBottom || 0,
  };

  const innerWrapStyle = wp < 100 ? {
    width: `${wp}%`,
    marginLeft: align === 'flex-end' ? 'auto' : align === 'center' ? 'auto' : '0',
    marginRight: align === 'flex-start' ? 'auto' : align === 'center' ? 'auto' : '0',
  } : { width: '100%' };

  return (
    <div
      ref={setNodeRef}
      style={containerStyle}
      onClick={() => onSelect(block.id)}
      className={`relative group rounded transition-all ${
        isSelected
          ? 'ring-2 ring-primary ring-offset-1 shadow-md bg-primary/5'
          : 'hover:ring-1 hover:ring-primary/30'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="absolute top-0.5 start-0.5 z-10 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing bg-primary/20 hover:bg-primary/40 rounded p-0.5 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-primary" />
      </button>

      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
        className="absolute top-0.5 end-0.5 z-10 opacity-0 group-hover:opacity-100 bg-destructive/10 hover:bg-destructive/20 rounded p-0.5 transition-opacity"
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </button>

      {/* Block content */}
      <div style={innerWrapStyle} className="px-1 py-0.5 pointer-events-none">
        <BlockVisual
          block={block}
          branding={branding}
          accentColor={accentColor}
          isA4={isA4}
          language={language}
        />
      </div>

      {/* Width indicator when selected */}
      {isSelected && wp < 100 && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <span className="text-[9px] bg-primary text-primary-foreground px-1 rounded-t-sm">{wp}%</span>
        </div>
      )}
    </div>
  );
}

// ── Canvas drop zone ──────────────────────────────────────────────────────────
function CanvasDropZone({ blocks, selectedId, onSelect, onDelete, branding, accentColor, isA4, language, paperWidthPx, emptyLabel }) {
  const ar = language === 'ar';
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop-zone' });

  return (
    <div
      ref={setNodeRef}
      style={{ width: `${paperWidthPx}px`, minHeight: isA4 ? 600 : 320 }}
      className={`bg-white shadow-xl border transition-all ${
        isOver ? 'border-primary/60 shadow-primary/20 ring-2 ring-primary/30' : 'border-gray-300'
      }`}
    >
      {blocks.length === 0 ? (
        <div className={`flex flex-col items-center justify-center h-full min-h-[200px] gap-2 text-muted-foreground ${isOver ? 'text-primary' : ''}`}>
          <Plus className={`h-8 w-8 opacity-30 ${isOver ? 'opacity-60' : ''}`} />
          <p className="text-xs text-center px-4">{emptyLabel}</p>
        </div>
      ) : (
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="p-2 space-y-0.5">
            {blocks.map(block => (
              <CanvasBlock
                key={block.id}
                block={block}
                isSelected={selectedId === block.id}
                onSelect={onSelect}
                onDelete={onDelete}
                branding={branding}
                accentColor={accentColor}
                isA4={isA4}
                language={language}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// ── Properties Panel ──────────────────────────────────────────────────────────
function PropertiesPanel({ block, docType, language, onChange }) {
  const ar = language === 'ar';
  if (!block) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs gap-2 p-3">
        <div className="text-3xl opacity-20">✦</div>
        <p className="text-center">{ar ? 'اختر كتلة لتعديل خصائصها' : 'Sélectionnez un bloc'}</p>
      </div>
    );
  }

  const blockDef = BLOCK_TYPES.find(b => b.type === block.type);
  const fields = FIELD_BINDINGS[docType] || [];
  const s = block.style || {};

  const updateStyle = (key, val) => onChange({ ...block, style: { ...s, [key]: val } });
  const updateField = (key, val) => onChange({ ...block, [key]: val });

  return (
    <div className="space-y-3 p-3 overflow-y-auto text-xs" dir={ar ? 'rtl' : 'ltr'}>
      <div className="font-semibold text-sm flex items-center gap-1.5 pb-1 border-b">
        <span>{blockDef?.icon}</span>
        <span>{ar ? blockDef?.ar : blockDef?.fr}</span>
      </div>

      {/* ─ Content fields ─ */}
      {block.type === 'text' && (
        <div>
          <Label className="text-xs">{ar ? 'النص' : 'Texte'}</Label>
          <textarea
            className="w-full mt-1 px-2 py-1.5 text-xs rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={3}
            value={block.content || ''}
            onChange={e => updateField('content', e.target.value)}
          />
        </div>
      )}

      {(block.type === 'field' || block.type === 'barcode' || block.type === 'qr') && (
        <div>
          <Label className="text-xs">{ar ? 'الحقل' : 'Champ'}</Label>
          <Select value={block.fieldKey} onValueChange={v => {
            const f = fields.find(f => f.key === v);
            onChange({ ...block, fieldKey: v, fieldLabel: f?.ar || v, fieldLabelFr: f?.fr || v });
          }}>
            <SelectTrigger className="mt-1 text-xs h-7"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fields.map(f => (
                <SelectItem key={f.key} value={f.key} className="text-xs">
                  {ar ? f.ar : f.fr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {block.type === 'qr' && (
        <div>
          <Label className="text-xs">{ar ? 'حجم QR (px)' : 'Taille QR (px)'}</Label>
          <Input type="number" min="40" max="200" className="mt-1 h-7 text-xs"
            value={block.qrSize || 80}
            onChange={e => updateField('qrSize', parseInt(e.target.value) || 80)}
          />
        </div>
      )}

      {block.type === 'separator' && (
        <div>
          <Label className="text-xs">{ar ? 'نوع الفاصل' : 'Style'}</Label>
          <div className="flex gap-1 mt-1">
            {[{ v: 'dashed', l: '- - -' }, { v: 'solid', l: '───' }].map(o => (
              <button key={o.v} type="button"
                onClick={() => updateField('separatorStyle', o.v)}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${(block.separatorStyle || 'dashed') === o.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
              >{o.l}</button>
            ))}
          </div>
        </div>
      )}

      {block.type === 'spacer' && (
        <div>
          <Label className="text-xs">{ar ? 'الارتفاع (px)' : 'Hauteur (px)'}</Label>
          <Input type="number" min="4" max="80" className="mt-1 h-7 text-xs"
            value={block.height || 12}
            onChange={e => updateField('height', parseInt(e.target.value) || 12)}
          />
        </div>
      )}

      {/* ─ Size & Position ─ */}
      <div className="border-t pt-2 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {ar ? 'الحجم والموضع' : 'Taille & Position'}
        </p>

        <div>
          <Label className="text-xs">{ar ? 'العرض على الورق' : 'Largeur sur papier'}</Label>
          <div className="flex gap-1 mt-1">
            {WIDTH_PRESETS.map(w => (
              <button key={w.value} type="button"
                onClick={() => updateStyle('widthPercent', w.value)}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${(s.widthPercent || 100) === w.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
                title={`${w.value}%`}
              >{w.label}</button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 text-center">{s.widthPercent || 100}%</p>
        </div>

        {(s.widthPercent || 100) < 100 && (
          <div>
            <Label className="text-xs">{ar ? 'الموضع الأفقي' : 'Position hor.'}</Label>
            <div className="flex gap-1 mt-1">
              {[
                { v: 'flex-start', icon: <AlignRight className="h-3 w-3" /> },
                { v: 'center', icon: <AlignCenter className="h-3 w-3" /> },
                { v: 'flex-end', icon: <AlignLeft className="h-3 w-3" /> },
              ].map(a => (
                <button key={a.v} type="button"
                  onClick={() => updateStyle('blockAlign', a.v)}
                  className={`flex-1 py-1.5 flex items-center justify-center rounded-md border transition-colors ${(s.blockAlign || 'center') === a.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
                >{a.icon}</button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">{ar ? 'هامش ↑' : 'Marge ↑'}</Label>
            <Input type="number" min="0" max="40" className="mt-1 h-7 text-xs"
              value={s.marginTop || 0}
              onChange={e => updateStyle('marginTop', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">{ar ? 'هامش ↓' : 'Marge ↓'}</Label>
            <Input type="number" min="0" max="40" className="mt-1 h-7 text-xs"
              value={s.marginBottom || 0}
              onChange={e => updateStyle('marginBottom', parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      {/* ─ Typography ─ */}
      {!['separator', 'spacer', 'logo', 'items_table', 'barcode', 'qr'].includes(block.type) && (
        <div className="border-t pt-2 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {ar ? 'الخط' : 'Typographie'}
          </p>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">{ar ? 'الحجم' : 'Taille'}</Label>
              <Input type="number" min="8" max="32" className="mt-1 h-7 text-xs"
                value={s.fontSize || 12}
                onChange={e => updateStyle('fontSize', parseInt(e.target.value) || 12)}
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">{ar ? 'اللون' : 'Couleur'}</Label>
              <input type="color" className="mt-1 h-7 w-full rounded border cursor-pointer"
                value={s.color || '#000000'}
                onChange={e => updateStyle('color', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-1">
            {[{ v: 'normal', l: ar ? 'عادي' : 'Normal' }, { v: 'bold', l: ar ? 'عريض' : 'Gras' }].map(w => (
              <button key={w.v} type="button"
                onClick={() => updateStyle('fontWeight', w.v)}
                className={`flex-1 py-1 text-xs rounded-md border transition-colors ${(s.fontWeight || 'normal') === w.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
              >{w.l}</button>
            ))}
          </div>

          <div className="flex gap-1">
            {[
              { v: 'right', icon: <AlignRight className="h-3.5 w-3.5" /> },
              { v: 'center', icon: <AlignCenter className="h-3.5 w-3.5" /> },
              { v: 'left', icon: <AlignLeft className="h-3.5 w-3.5" /> },
            ].map(a => (
              <button key={a.v} type="button"
                onClick={() => updateStyle('textAlign', a.v)}
                className={`flex-1 py-1.5 flex items-center justify-center rounded-md border transition-colors ${(s.textAlign || 'right') === a.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
              >{a.icon}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Drag overlay content ──────────────────────────────────────────────────────
function OverlayContent({ activeId, blocks, language }) {
  const ar = language === 'ar';
  if (!activeId) return null;

  if (activeId.startsWith('palette:')) {
    const blockType = activeId.replace('palette:', '');
    const bt = BLOCK_TYPES.find(b => b.type === blockType);
    return (
      <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md shadow-lg text-xs flex items-center gap-1.5">
        <span>{bt?.icon}</span>
        <span>{ar ? bt?.ar : bt?.fr}</span>
      </div>
    );
  }

  const block = blocks.find(b => b.id === activeId);
  if (!block) return null;
  const bt = BLOCK_TYPES.find(b => b.type === block.type);
  return (
    <div className="bg-background border border-primary rounded-md px-3 py-1.5 shadow-lg text-xs flex items-center gap-1.5 opacity-90">
      <GripVertical className="h-3.5 w-3.5 text-primary" />
      <span>{bt?.icon}</span>
      <span>{ar ? bt?.ar : bt?.fr}</span>
    </div>
  );
}

// ── Main editor page ──────────────────────────────────────────────────────────
export default function TemplateEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const ar = language === 'ar';

  const [name_ar, setNameAr] = useState('قالب جديد');
  const [name_fr, setNameFr] = useState('Nouveau modèle');
  const [docType, setDocType] = useState(searchParams.get('docType') || 'sale');
  const [paperWidth, setPaperWidth] = useState(80);
  const [accentColor, setAccentColor] = useState('#0f766e');
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [branding, setBranding] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const brandRes = await apiClient.get('/settings/tenant-branding').catch(() => ({ data: {} }));
        setBranding(brandRes.data || {});

        if (id) {
          const tRes = await apiClient.get('/printing/templates');
          const tmpl = (tRes.data || []).find(t => t.id === id);
          if (tmpl) {
            setNameAr(tmpl.name_ar || '');
            setNameFr(tmpl.name_fr || '');
            setDocType(tmpl.type || 'sale');
            setPaperWidth(tmpl.paper_width || 80);
            setAccentColor(tmpl.accent_color || '#0f766e');
            setBlocks(tmpl.blocks || []);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedBlock = blocks.find(b => b.id === selectedId) || null;
  const isA4 = paperWidth === 210;
  const paperWidthPx = isA4 ? 390 : paperWidth === 58 ? 219 : 302;

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;

    const fromPalette = String(active.id).startsWith('palette:');

    if (fromPalette) {
      // Drop from palette onto canvas → create new block
      const blockType = String(active.id).replace('palette:', '');
      const newBlock = createBlock(blockType, docType);
      if (over.id === 'canvas-drop-zone') {
        setBlocks(prev => [...prev, newBlock]);
      } else {
        // Dropped onto an existing block → insert after it
        const targetIdx = blocks.findIndex(b => b.id === over.id);
        setBlocks(prev => [
          ...prev.slice(0, targetIdx + 1),
          newBlock,
          ...prev.slice(targetIdx + 1),
        ]);
      }
      setSelectedId(newBlock.id);
    } else {
      // Reorder within canvas
      if (active.id !== over.id) {
        const oldIdx = blocks.findIndex(b => b.id === active.id);
        const newIdx = blocks.findIndex(b => b.id === over.id);
        if (oldIdx !== -1 && newIdx !== -1) {
          setBlocks(prev => arrayMove(prev, oldIdx, newIdx));
        }
      }
    }
  };

  const deleteBlock = (blockId) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedId === blockId) setSelectedId(null);
  };

  const updateBlock = useCallback((updated) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
  }, []);

  const moveBlock = (blockId, dir) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId);
      if (dir === 'up' && idx > 0) return arrayMove(prev, idx, idx - 1);
      if (dir === 'down' && idx < prev.length - 1) return arrayMove(prev, idx, idx + 1);
      return prev;
    });
  };

  const duplicateBlock = (blockId) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const newBlock = { ...block, id: Math.random().toString(36).slice(2) };
    const idx = blocks.findIndex(b => b.id === blockId);
    setBlocks(prev => [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]);
    setSelectedId(newBlock.id);
  };

  const handleSave = async () => {
    if (!name_ar.trim()) {
      toast.error(ar ? 'أدخل اسم القالب بالعربية' : 'Entrez le nom en arabe');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name_ar, name_fr,
        type: docType,
        printer_type: isA4 ? 'a4' : 'thermal',
        paper_width: paperWidth,
        is_custom: true,
        blocks,
        accent_color: accentColor,
        template_html: '',
      };
      if (id) {
        await apiClient.put(`/printing/templates/${id}`, payload);
        toast.success(ar ? 'تم حفظ القالب' : 'Modèle enregistré');
      } else {
        await apiClient.post('/printing/templates', payload);
        toast.success(ar ? 'تم إنشاء القالب' : 'Modèle créé');
      }
      navigate('/settings?tab=printer');
    } catch (e) {
      toast.error(ar ? 'خطأ في الحفظ' : 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-64px)]" dir={ar ? 'rtl' : 'ltr'}>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-background flex-shrink-0 flex-wrap">
          <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={() => navigate('/settings?tab=printer')}>
            <ArrowRight className={`h-4 w-4 ${ar ? '' : 'rotate-180'}`} />
            {ar ? 'رجوع' : 'Retour'}
          </Button>
          <div className="w-px h-5 bg-border" />

          <Input value={name_ar} onChange={e => setNameAr(e.target.value)}
            placeholder={ar ? 'اسم القالب (عربي)' : 'Nom (arabe)'}
            className="h-8 w-32 text-sm" />
          <Input value={name_fr} onChange={e => setNameFr(e.target.value)}
            placeholder={ar ? 'الاسم (فرنسي)' : 'Nom (français)'}
            className="h-8 w-32 text-sm" />

          <Select value={docType} onValueChange={v => { setDocType(v); setBlocks([]); setSelectedId(null); }}>
            <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DOC_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-sm">{ar ? v.ar : v.fr}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(paperWidth)} onValueChange={v => setPaperWidth(Number(v))}>
            <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAPER_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)} className="text-sm">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
              className="h-8 w-10 rounded border cursor-pointer" title={ar ? 'لون التمييز' : 'Couleur accent'} />
          </div>

          <div className="ms-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {blocks.length} {ar ? 'كتلة' : 'blocs'}
            </span>
            <Button size="sm" className="gap-1 h-8" onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ar ? 'حفظ' : 'Enregistrer'}
            </Button>
          </div>
        </div>

        {/* ── Three-column layout ── */}
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={handleDragStart} onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 overflow-hidden">

            {/* ── Left: Palette ── */}
            <div className="w-44 border-e bg-muted/10 flex flex-col flex-shrink-0 overflow-y-auto">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b sticky top-0 bg-muted/10 backdrop-blur-sm">
                <div className="flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  {ar ? 'اسحب إلى الورقة' : 'Glisser sur papier'}
                </div>
              </div>
              <div className="p-1.5 space-y-0.5">
                {BLOCK_TYPES.map(bt => (
                  <PaletteItem key={bt.type} bt={bt} language={language} />
                ))}
              </div>
            </div>

            {/* ── Center: Interactive paper canvas ── */}
            <div className="flex-1 overflow-auto bg-gray-200 flex flex-col items-center py-6 gap-2">
              <div className="text-[10px] text-gray-500 mb-1">
                {ar
                  ? `← اسحب الكتل هنا • انقر لتحرير • اسحب للترتيب →`
                  : `← Glisser ici • Cliquer pour éditer • Glisser pour réordonner →`
                }
              </div>
              <CanvasDropZone
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDelete={deleteBlock}
                branding={branding}
                accentColor={accentColor}
                isA4={isA4}
                language={language}
                paperWidthPx={paperWidthPx}
                emptyLabel={ar ? 'اسحب كتلة من اليسار\nلبدء تصميم القالب' : 'Glissez un bloc depuis la gauche\npour commencer le design'}
              />
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10px] text-gray-500">
                  {paperWidth === 210 ? 'A4' : `${paperWidth}mm`}
                </span>
                {selectedBlock && (
                  <div className="flex items-center gap-1 bg-white rounded border shadow-sm px-2 py-1">
                    <span className="text-[10px] text-muted-foreground">{ar ? 'المحدد:' : 'Sélectionné:'}</span>
                    <span className="text-[10px] font-medium">{ar ? BLOCK_TYPES.find(b => b.type === selectedBlock.type)?.ar : BLOCK_TYPES.find(b => b.type === selectedBlock.type)?.fr}</span>
                    <button type="button" onClick={() => moveBlock(selectedBlock.id, 'up')} className="p-0.5 hover:bg-muted rounded" title={ar ? 'أعلى' : 'Haut'}>
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => moveBlock(selectedBlock.id, 'down')} className="p-0.5 hover:bg-muted rounded" title={ar ? 'أسفل' : 'Bas'}>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => duplicateBlock(selectedBlock.id)} className="p-0.5 hover:bg-muted rounded" title={ar ? 'نسخ' : 'Dupliquer'}>
                      <Copy className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => deleteBlock(selectedBlock.id)} className="p-0.5 hover:bg-muted rounded text-destructive" title={ar ? 'حذف' : 'Supprimer'}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: Properties ── */}
            <div className="w-52 border-s bg-background flex-shrink-0 overflow-hidden flex flex-col">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b flex-shrink-0">
                {ar ? 'الخصائص' : 'Propriétés'}
              </div>
              <div className="flex-1 overflow-y-auto">
                <PropertiesPanel
                  block={selectedBlock}
                  docType={docType}
                  language={language}
                  onChange={updateBlock}
                />
              </div>
            </div>
          </div>

          <DragOverlay>
            <OverlayContent activeId={activeId} blocks={blocks} language={language} />
          </DragOverlay>
        </DndContext>
      </div>
    </Layout>
  );
}
