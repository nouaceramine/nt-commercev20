import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * EntityCode — short human-readable identifier badge for tenants/agents with
 * one-click copy. The displayed code is derived from the entity UUID:
 *   T-<6 hex chars>     for tenants
 *   AG-<6 hex chars>    for agents
 * The full UUID is also copyable on click — shown in tooltip.
 */
const PREFIX = { tenant: 'T-', agent: 'AG-' };

export const shortCode = (uuid, type = 'tenant') => {
  if (!uuid) return '—';
  const clean = String(uuid).replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${PREFIX[type] || ''}${clean}`;
};

export const EntityCode = ({ uuid, type = 'tenant', testId = '' }) => {
  const [copied, setCopied] = useState(false);
  const code = shortCode(uuid, type);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(uuid || code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be unavailable in some browsers */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={uuid ? `الكامل: ${uuid}\nاضغط للنسخ` : 'اضغط للنسخ'}
      className="inline-flex items-center gap-1 rounded-md bg-muted/60 hover:bg-muted px-1.5 py-0.5 text-[10px] font-mono text-foreground transition-colors group"
      data-testid={testId || `entity-code-${uuid || ''}`}
    >
      <span>{code}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
      )}
    </button>
  );
};

export default EntityCode;
