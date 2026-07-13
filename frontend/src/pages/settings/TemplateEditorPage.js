/**
 * TemplateEditorPage - Visual Template Editor (Refactored)
 * Before: ~35K lines monolithic | After: ~80 lines composition
 * Refactoring: Extract Component x5, Move Method, Replace Magic Numbers
 * 
 * Architecture:
 *   TemplateEditorPage (this file) - State orchestrator
 *   TemplateToolbar - Top bar
 *   PalettePanel - Left sidebar
 *   CanvasPanel - Center canvas
 *   TemplatePropertiesPanel - Right sidebar
 *   TemplateService - API calls
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { createBlock } from '../../lib/customTemplateRenderer';
import { RefreshCw } from 'lucide-react';

import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';

// === Extracted Components ===
import TemplateToolbar from '../../components/template/TemplateToolbar';
import PalettePanel from '../../components/template/PalettePanel';
import CanvasPanel from '../../components/template/CanvasPanel';
import TemplatePropertiesPanel from '../../components/template/TemplatePropertiesPanel';
import BlockVisual from '../../components/template/BlockVisual';

// === Extracted Service & Constants ===
import { TemplateService } from '../../services/TemplateService';
import { getPaperWidthPx, DEFAULT_TEMPLATE } from '../../lib/templateConstants';

function OverlayContent({ activeId, blocks, language }) {
  const ar = language === 'ar';
  if (!activeId) return null;
  if (activeId.startsWith('palette:')) {
    const blockType = activeId.replace('palette:', '');
    const { BLOCK_TYPES } = require('../../lib/customTemplateRenderer');
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
  return (
    <div className="bg-background border border-primary rounded-md px-3 py-1.5 shadow-lg text-xs flex items-center gap-1.5 opacity-90">
      <span className="font-mono">[{block.type}]</span>
    </div>
  );
}

export default function TemplateEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const ar = language === 'ar';

  // State
  const [name_ar, setNameAr] = useState(DEFAULT_TEMPLATE.name_ar);
  const [name_fr, setNameFr] = useState(DEFAULT_TEMPLATE.name_fr);
  const [docType, setDocType] = useState(searchParams.get('docType') || DEFAULT_TEMPLATE.docType);
  const [paperWidth, setPaperWidth] = useState(DEFAULT_TEMPLATE.paperWidth);
  const [accentColor, setAccentColor] = useState(DEFAULT_TEMPLATE.accentColor);
  const [blocks, setBlocks] = useState(DEFAULT_TEMPLATE.blocks);
  const [selectedId, setSelectedId] = useState(null);
  const [branding, setBranding] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Init
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const brand = await TemplateService.loadBranding();
      if (!mounted) return;
      setBranding(brand);

      if (id) {
        const tmpl = await TemplateService.loadTemplate(id);
        if (tmpl && mounted) {
          setNameAr(tmpl.name_ar || '');
          setNameFr(tmpl.name_fr || '');
          setDocType(tmpl.type || 'sale');
          setPaperWidth(tmpl.paper_width || 80);
          setAccentColor(tmpl.accent_color || '#0f766e');
          setBlocks(tmpl.blocks || []);
        }
      }
      if (mounted) setLoading(false);
    };
    init();
    return () => { mounted = false; };
  }, [id]);

  const paperWidthPx = getPaperWidthPx(paperWidth);

  // Block operations
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

  // Drag & Drop
  const handleDragStart = ({ active }) => setActiveId(active.id);
  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const fromPalette = String(active.id).startsWith('palette:');
    if (fromPalette) {
      const blockType = String(active.id).replace('palette:', '');
      const newBlock = createBlock(blockType, docType);
      if (over.id === 'canvas-drop-zone') {
        setBlocks(prev => [...prev, newBlock]);
      } else {
        const targetIdx = blocks.findIndex(b => b.id === over.id);
        setBlocks(prev => [...prev.slice(0, targetIdx + 1), newBlock, ...prev.slice(targetIdx + 1)]);
      }
      setSelectedId(newBlock.id);
    } else if (active.id !== over.id) {
      const oldIdx = blocks.findIndex(b => b.id === active.id);
      const newIdx = blocks.findIndex(b => b.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) setBlocks(prev => arrayMove(prev, oldIdx, newIdx));
    }
  };

  // Save
  const handleSave = async () => {
    if (!name_ar.trim()) { toast.error(ar ? 'أدخل اسم القالب' : 'Entrez le nom'); return; }
    setSaving(true);
    try {
      await TemplateService.saveTemplate({ id, name_ar, name_fr, docType, paperWidth, accentColor, blocks });
      toast.success(id ? (ar ? 'تم الحفظ' : 'Enregistré') : (ar ? 'تم الإنشاء' : 'Créé'));
      navigate('/settings?tab=printer');
    } catch {
      toast.error(ar ? 'خطأ' : 'Erreur');
    } finally { setSaving(false); }
  };

  const selectedBlock = blocks.find(b => b.id === selectedId) || null;

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
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

          <TemplateToolbar
            nameAr={name_ar} setNameAr={setNameAr}
            nameFr={name_fr} setNameFr={setNameFr}
            docType={docType} setDocType={setDocType}
            paperWidth={paperWidth} setPaperWidth={setPaperWidth}
            accentColor={accentColor} setAccentColor={setAccentColor}
            blocksCount={blocks.length} saving={saving}
            onSave={handleSave}
            onNavigateBack={() => navigate('/settings?tab=printer')}
            language={language}
          />

          <div className="flex flex-1 overflow-hidden">
            <PalettePanel language={language} />
            <CanvasPanel
              blocks={blocks} selectedId={selectedId}
              setSelectedId={setSelectedId} deleteBlock={deleteBlock}
              moveBlock={moveBlock} duplicateBlock={duplicateBlock}
              branding={branding} accentColor={accentColor}
              paperWidth={paperWidth} language={language}
              paperWidthPx={paperWidthPx}
            />
            <div className="w-52 border-s bg-background flex-shrink-0 overflow-hidden flex flex-col">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b flex-shrink-0">
                {ar ? 'الخصائص' : 'Propriétés'}
              </div>
              <div className="flex-1 overflow-y-auto">
                <TemplatePropertiesPanel
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
