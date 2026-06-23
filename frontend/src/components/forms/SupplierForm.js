import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Plus } from 'lucide-react';

/**
 * Shared supplier form fields.
 *
 * Renders only the input fields (no <form> wrapper or footer buttons) so each
 * caller keeps its own submit logic and dialog chrome.
 *
 * Modes:
 *  - compact (default): name / phone / email only (used by tenant management dialogs).
 *  - full: complete field set with code, family selector, address, notes
 *    (used by the standalone SuppliersPage).
 *
 * Props:
 *  - formData, setFormData: controlled state owned by the caller.
 *  - compact: boolean toggle between the two field sets.
 *  - language, t: i18n helpers (required for full mode).
 *  - supplierFamilies, onAddFamily: family selector data/handler (full mode).
 */
export default function SupplierForm({
  formData,
  setFormData,
  compact = false,
  language = 'ar',
  t = {},
  supplierFamilies = [],
  onAddFamily,
}) {
  if (compact) {
    return (
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>الاسم</Label>
          <Input
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>الهاتف</Label>
          <Input
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>البريد الإلكتروني</Label>
          <Input
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Name & Code */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t.supplierName} *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="h-9"
            data-testid="supplier-name-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'الكود' : 'Code'}</Label>
          <Input
            value={formData.code}
            className="h-9 font-mono text-sm bg-muted/50"
            readOnly
            placeholder="FR00001/2026"
            data-testid="supplier-code-input"
          />
        </div>
      </div>

      {/* Phone & Email */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t.phone}</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            dir="ltr"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.email}</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="h-9"
          />
        </div>
      </div>

      {/* Family */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{language === 'ar' ? 'العائلة' : 'Famille'}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddFamily}
            className="h-5 px-1 text-xs"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <Select
          value={formData.family_id || "none"}
          onValueChange={(value) => setFormData({ ...formData, family_id: value === "none" ? "" : value })}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={language === 'ar' ? 'اختر' : 'Choisir'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{language === 'ar' ? 'بدون' : 'Sans'}</SelectItem>
            {supplierFamilies.map(family => (
              <SelectItem key={family.id} value={family.id}>
                {family.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Address */}
      <div className="space-y-1">
        <Label className="text-xs">{t.address}</Label>
        <Input
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          className="h-9"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label className="text-xs">{t.notes}</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>
    </>
  );
}
