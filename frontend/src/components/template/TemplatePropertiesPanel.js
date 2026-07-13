/**
 * TemplatePropertiesPanel - Right sidebar for editing block properties
 * Extracted from TemplateEditorPage.js (Refactoring: Extract Component)
 * Addresses: Long Method (PropertiesPanel was ~150 lines)
 */
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { FIELD_BINDINGS } from '../../lib/customTemplateRenderer';
import { WIDTH_PRESETS } from '../../lib/templateConstants';

// ── Typography section ─────────────────────────────────────────────────────
function TypographySection({ block, style, ar, onUpdateStyle }) {
  if (['separator', 'spacer', 'logo', 'items_table', 'barcode', 'qr'].includes(block.type)) return null;
  return (
    <div className="border-t pt-2 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{ar ? 'الخط' : 'Typographie'}</p>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-xs">{ar ? 'الحجم' : 'Taille'}</Label>
          <Input type="number" min={8} max={32} className="mt-1 h-7 text-xs"
            value={style.fontSize || 12}
            onChange={e => onUpdateStyle('fontSize', parseInt(e.target.value) || 12)} />
        </div>
        <div className="flex-1">
          <Label className="text-xs">{ar ? 'اللون' : 'Couleur'}</Label>
          <input type="color" className="mt-1 h-7 w-full rounded border cursor-pointer"
            value={style.color || '#000000'}
            onChange={e => onUpdateStyle('color', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-1">
        {[{ v: 'normal', l: ar ? 'عادي' : 'Normal' }, { v: 'bold', l: ar ? 'عريض' : 'Gras' }].map(w => (
          <button key={w.v} type="button"
            onClick={() => onUpdateStyle('fontWeight', w.v)}
            className={`flex-1 py-1 text-xs rounded-md border transition-colors ${(style.fontWeight || 'normal') === w.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{w.l}</button>
        ))}
      </div>
      <div className="flex gap-1">
        {[{ v: 'right', icon: <AlignRight className="h-3.5 w-3.5" /> }, { v: 'center', icon: <AlignCenter className="h-3.5 w-3.5" /> }, { v: 'left', icon: <AlignLeft className="h-3.5 w-3.5" /> }].map(a => (
          <button key={a.v} type="button"
            onClick={() => onUpdateStyle('textAlign', a.v)}
            className={`flex-1 py-1.5 flex items-center justify-center rounded-md border transition-colors ${(style.textAlign || 'right') === a.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{a.icon}</button>
        ))}
      </div>
    </div>
  );
}

// ── Size & Position section ────────────────────────────────────────────────
function SizePositionSection({ style, ar, onUpdateStyle }) {
  const wp = style.widthPercent || 100;
  return (
    <div className="border-t pt-2 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{ar ? 'الحجم والموضع' : 'Taille & Position'}</p>
      <div>
        <Label className="text-xs">{ar ? 'العرض على الورق' : 'Largeur sur papier'}</Label>
        <div className="flex gap-1 mt-1">
          {WIDTH_PRESETS.map(w => (
            <button key={w.value} type="button"
              onClick={() => onUpdateStyle('widthPercent', w.value)}
              className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${wp === w.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
              title={`${w.value}%`}>{w.label}</button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 text-center">{wp}%</p>
      </div>
      {wp < 100 && (
        <div>
          <Label className="text-xs">{ar ? 'الموضع الأفقي' : 'Position hor.'}</Label>
          <div className="flex gap-1 mt-1">
            {[{ v: 'flex-start', icon: <AlignRight className="h-3 w-3" /> }, { v: 'center', icon: <AlignCenter className="h-3 w-3" /> }, { v: 'flex-end', icon: <AlignLeft className="h-3 w-3" /> }].map(a => (
              <button key={a.v} type="button"
                onClick={() => onUpdateStyle('blockAlign', a.v)}
                className={`flex-1 py-1.5 flex items-center justify-center rounded-md border transition-colors ${(style.blockAlign || 'center') === a.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{a.icon}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-xs">{ar ? 'هامش ↑' : 'Marge ↑'}</Label>
          <Input type="number" min={0} max={40} className="mt-1 h-7 text-xs"
            value={style.marginTop || 0}
            onChange={e => onUpdateStyle('marginTop', parseInt(e.target.value) || 0)} />
        </div>
        <div className="flex-1">
          <Label className="text-xs">{ar ? 'هامش ↓' : 'Marge ↓'}</Label>
          <Input type="number" min={0} max={40} className="mt-1 h-7 text-xs"
            value={style.marginBottom || 0}
            onChange={e => onUpdateStyle('marginBottom', parseInt(e.target.value) || 0)} />
        </div>
      </div>
    </div>
  );
}

// ── Content-specific sections ──────────────────────────────────────────────
function ContentSection({ block, fields, ar, onUpdateField, onUpdateBlock }) {
  if (block.type === 'text') {
    return (
      <div>
        <Label className="text-xs">{ar ? 'النص' : 'Texte'}</Label>
        <textarea className="w-full mt-1 px-2 py-1.5 text-xs rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          rows={3} value={block.content || ''}
          onChange={e => onUpdateField('content', e.target.value)} />
      </div>
    );
  }
  if (block.type === 'field' || block.type === 'barcode' || block.type === 'qr') {
    return (
      <div>
        <Label className="text-xs">{ar ? 'الحقل' : 'Champ'}</Label>
        <Select value={block.fieldKey} onValueChange={v => {
          const f = fields.find(fld => fld.key === v);
          onUpdateBlock({ ...block, fieldKey: v, fieldLabel: f?.ar || v, fieldLabelFr: f?.fr || v });
        }}>
          <SelectTrigger className="mt-1 text-xs h-7"><SelectValue /></SelectTrigger>
          <SelectContent>
            {fields.map(f => <SelectItem key={f.key} value={f.key} className="text-xs">{ar ? f.ar : f.fr}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (block.type === 'qr') {
    return (
      <div>
        <Label className="text-xs">{ar ? 'حجم QR (px)' : 'Taille QR (px)'}</Label>
        <Input type="number" min={40} max={200} className="mt-1 h-7 text-xs"
          value={block.qrSize || 80}
          onChange={e => onUpdateField('qrSize', parseInt(e.target.value) || 80)} />
      </div>
    );
  }
  if (block.type === 'separator') {
    return (
      <div>
        <Label className="text-xs">{ar ? 'نوع الفاصل' : 'Style'}</Label>
        <div className="flex gap-1 mt-1">
          {[{ v: 'dashed', l: '- - -' }, { v: 'solid', l: '───' }].map(o => (
            <button key={o.v} type="button"
              onClick={() => onUpdateField('separatorStyle', o.v)}
              className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${(block.separatorStyle || 'dashed') === o.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{o.l}</button>
          ))}
        </div>
      </div>
    );
  }
  if (block.type === 'spacer') {
    return (
      <div>
        <Label className="text-xs">{ar ? 'الارتفاع (px)' : 'Hauteur (px)'}</Label>
        <Input type="number" min={4} max={80} className="mt-1 h-7 text-xs"
          value={block.height || 12}
          onChange={e => onUpdateField('height', parseInt(e.target.value) || 12)} />
      </div>
    );
  }
  return null;
}

// ── Main Properties Panel ──────────────────────────────────────────────────
export default function TemplatePropertiesPanel({ block, docType, language, onChange }) {
  const ar = language === 'ar';

  if (!block) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs gap-2 p-3">
        <div className="text-3xl opacity-20">✦</div>
        <p className="text-center">{ar ? 'اختر كتلة لتعديل خصائصها' : 'Sélectionnez un bloc'}</p>
      </div>
    );
  }

  const { BLOCK_TYPES } = require('../../lib/customTemplateRenderer');
  const blockDef = BLOCK_TYPES.find(b => b.type === block.type);
  const fields = FIELD_BINDINGS[docType] || [];
  const s = block.style || {};

  const updateStyle = (key, val) => onChange({ ...block, style: { ...s, [key]: val } });
  const updateField = (key, val) => onChange({ ...block, [key]: val });
  const updateBlock = (updated) => onChange(updated);

  return (
    <div className="space-y-3 p-3 overflow-y-auto text-xs" dir={ar ? 'rtl' : 'ltr'}>
      <div className="font-semibold text-sm flex items-center gap-1.5 pb-1 border-b">
        <span>{blockDef?.icon}</span>
        <span>{ar ? blockDef?.ar : blockDef?.fr}</span>
      </div>

      <ContentSection block={block} fields={fields} ar={ar} onUpdateField={updateField} onUpdateBlock={updateBlock} />
      <SizePositionSection style={s} ar={ar} onUpdateStyle={updateStyle} />
      <TypographySection block={block} style={s} ar={ar} onUpdateStyle={updateStyle} />
    </div>
  );
}
