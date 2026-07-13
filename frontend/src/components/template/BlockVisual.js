/**
 * BlockVisual - Renders a block's visual preview on the canvas
 * Extracted from TemplateEditorPage.js (Refactoring: Replace Conditional with Lookup)
 * The switch statement is replaced with a block-type registry for extensibility.
 */

// ── Individual block renderers (polymorphic dispatch) ──────────────────────

function LogoBlock({ branding }) {
  const logoUrl = branding?.logo_url;
  return (
    <div className="flex justify-center py-1">
      {logoUrl
        ? <img src={logoUrl} alt="logo" className="max-h-10 object-contain" />
        : <div className="w-10 h-10 bg-gray-100 border rounded flex items-center justify-center text-muted-foreground text-xs">🖼</div>
      }
    </div>
  );
}

function StoreNameBlock({ branding, accentColor, fontSize }) {
  return (
    <div style={{ color: accentColor, fontWeight: 'bold', textAlign: 'center', fontSize: `${fontSize || 16}px` }}>
      {branding?.name || 'اسم المتجر'}
    </div>
  );
}

function TextBlock({ content, style, language }) {
  const ar = language === 'ar';
  return (
    <div style={style}>
      {content || <span className="text-muted-foreground italic text-xs">{ar ? '(نص فارغ)' : '(texte vide)'}</span>}
    </div>
  );
}

function FieldBlock({ block, style, language }) {
  const ar = language === 'ar';
  const lbl = ar ? block.fieldLabel : (block.fieldLabelFr || block.fieldLabel);
  return (
    <div style={{ ...style, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: '#777' }}>{lbl}</span>
      <span style={{ fontWeight: 'bold', color: '#555' }}>----</span>
    </div>
  );
}

function ItemsTableBlock({ accentColor, language }) {
  const ar = language === 'ar';
  const cols = ar
    ? ['المنتج', 'الكمية', 'السعر', 'الإجمالي']
    : ['Produit', 'Qté', 'Prix', 'Total'];
  return (
    <div>
      <div className="grid grid-cols-4 gap-1 py-1 px-1 rounded-sm text-foreground text-[10px]" style={{ background: accentColor }}>
        {cols.map(c => <span key={c}>{c}</span>)}
      </div>
      {[1, 2].map(i => (
        <div key={i} className="grid grid-cols-4 gap-1 border-b border-gray-100 py-0.5 px-1 text-[10px] text-muted-foreground">
          <span>----</span><span>1</span><span>--</span><span>--</span>
        </div>
      ))}
    </div>
  );
}

function TotalsBlock({ accentColor, language, style }) {
  const ar = language === 'ar';
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

function SeparatorBlock({ block }) {
  return (
    <hr style={{
      borderTop: block.separatorStyle === 'solid' ? '1px solid #999' : '1px dashed #aaa',
      margin: '2px 0'
    }} />
  );
}

function SpacerBlock({ block }) {
  return (
    <div style={{ height: `${block.height || 12}px` }} className="bg-gray-50 border border-dashed border-gray-200 rounded" />
  );
}

function BarcodeBlock({ block, language }) {
  const ar = language === 'ar';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[10px] text-muted-foreground">{ar ? block.fieldLabel : (block.fieldLabelFr || block.fieldLabel)}</div>
      <div className="font-mono text-[9px] tracking-widest text-gray-800">▐▐▌▌▐▌▌▐▐▌▐▐▌▌▐</div>
    </div>
  );
}

function QRBlock({ block }) {
  const size = Math.min(block.qrSize || 60, 80);
  return (
    <div className="flex justify-center">
      <div style={{ width: size, height: size }} className="border border-gray-300 rounded bg-gray-50 flex items-center justify-center text-muted-foreground text-xs font-mono">
        QR
      </div>
    </div>
  );
}

function FallbackBlock({ block }) {
  return <div className="text-muted-foreground text-xs text-center">({block.type})</div>;
}

// ── Block renderer registry (Replace Switch Statement) ─────────────────────
const BLOCK_RENDERERS = {
  logo: LogoBlock,
  store_name: StoreNameBlock,
  text: TextBlock,
  field: FieldBlock,
  items_table: ItemsTableBlock,
  totals: TotalsBlock,
  separator: SeparatorBlock,
  spacer: SpacerBlock,
  barcode: BarcodeBlock,
  qr: QRBlock,
};

// ── Main exported component ────────────────────────────────────────────────
export default function BlockVisual({ block, branding, accentColor, isA4, language }) {
  const ar = language === 'ar';
  const s = block.style || {};
  const baseStyle = {
    fontSize: `${s.fontSize || 12}px`,
    fontWeight: s.fontWeight || 'normal',
    textAlign: s.textAlign || (ar ? 'right' : 'left'),
    color: s.color || '#111',
    direction: ar ? 'rtl' : 'ltr',
  };

  const Renderer = BLOCK_RENDERERS[block.type] || FallbackBlock;

  return (
    <Renderer
      block={block}
      branding={branding}
      accentColor={accentColor}
      isA4={isA4}
      language={language}
      style={baseStyle}
      content={block.content}
      fontSize={s.fontSize}
    />
  );
}
