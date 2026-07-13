/**
 * CanvasPanel - Center interactive paper canvas with sortable blocks
 * Extracted from TemplateEditorPage.js (Refactoring: Extract Component)
 */
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import BlockVisual from './BlockVisual';

// ── Sortable block on the canvas ───────────────────────────────────────────
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
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="absolute top-0.5 start-0.5 z-10 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing bg-primary/20 hover:bg-primary/40 rounded p-0.5 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-primary" />
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
        className="absolute top-0.5 end-0.5 z-10 opacity-0 group-hover:opacity-100 bg-destructive/10 hover:bg-destructive/20 rounded p-0.5 transition-opacity"
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </button>

      <div style={innerWrapStyle} className="px-1 py-0.5 pointer-events-none">
        <BlockVisual block={block} branding={branding} accentColor={accentColor} isA4={isA4} language={language} />
      </div>

      {isSelected && wp < 100 && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <span className="text-[9px] bg-primary text-primary-foreground px-1 rounded-t-sm">{wp}%</span>
        </div>
      )}
    </div>
  );
}

// ── Canvas drop zone ───────────────────────────────────────────────────────
function CanvasDropZone({ blocks, selectedId, onSelect, onDelete, branding, accentColor, isA4, language, paperWidthPx, emptyLabel }) {
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
          <svg className={`h-8 w-8 opacity-30 ${isOver ? 'opacity-60' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <p className="text-xs text-center px-4 whitespace-pre-line">{emptyLabel}</p>
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

// ── Main Canvas Panel (with selection toolbar) ─────────────────────────────
export default function CanvasPanel({
  blocks, selectedId, setSelectedId, deleteBlock, moveBlock, duplicateBlock,
  branding, accentColor, paperWidth, language, paperWidthPx,
}) {
  const ar = language === 'ar';
  const isA4 = paperWidth === 210;
  const selectedBlock = blocks.find(b => b.id === selectedId) || null;

  return (
    <div className="flex-1 overflow-auto bg-gray-200 flex flex-col items-center py-6 gap-2">
      <div className="text-[10px] text-muted-foreground mb-1">
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
        <span className="text-[10px] text-muted-foreground">
          {paperWidth === 210 ? 'A4' : `${paperWidth}mm`}
        </span>
        {selectedBlock && (
          <div className="flex items-center gap-1 bg-white rounded border shadow-sm px-2 py-1">
            <span className="text-[10px] text-muted-foreground">{ar ? 'المحدد:' : 'Sélectionné:'}</span>
            <span className="text-[10px] font-medium">{selectedBlock.type}</span>
            <button type="button" onClick={() => moveBlock(selectedBlock.id, 'up')} className="p-0.5 hover:bg-muted rounded" title={ar ? 'أعلى' : 'Haut'}>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button type="button" onClick={() => moveBlock(selectedBlock.id, 'down')} className="p-0.5 hover:bg-muted rounded" title={ar ? 'أسفل' : 'Bas'}>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button type="button" onClick={() => duplicateBlock(selectedBlock.id)} className="p-0.5 hover:bg-muted rounded" title={ar ? 'نسخ' : 'Dupliquer'}>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button type="button" onClick={() => deleteBlock(selectedBlock.id)} className="p-0.5 hover:bg-muted rounded text-destructive" title={ar ? 'حذف' : 'Supprimer'}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
