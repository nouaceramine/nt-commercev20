/**
 * PalettePanel - Left sidebar with draggable block types
 * Extracted from TemplateEditorPage.js (Refactoring: Extract Component)
 */
import { useDraggable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { BLOCK_TYPES } from '../../lib/customTemplateRenderer';

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

export default function PalettePanel({ language }) {
  const ar = language === 'ar';
  return (
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
  );
}
