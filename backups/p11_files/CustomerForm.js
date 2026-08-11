import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Plus } from 'lucide-react';

/**
 * Shared customer form fields.
 *
 * Renders only the input fields (no <form> wrapper or footer buttons) so each
 * caller keeps its own submit logic and dialog chrome.
 *
 * Modes:
 *  - compact (default): name / phone / email only (used by tenant management dialogs).
 *  - full: complete field set with code, type, discount, debt limit, birthdate,
 *    national id, commercial register, family selector, address, notes
 *    (used by the standalone CustomersPage).
 *
 * Props:
 *  - formData, setFormData: controlled state owned by the caller.
 *  - compact: boolean toggle between the two field sets.
 *  - language, t: i18n helpers (required for full mode).
 *  - customerFamilies, onAddFamily: family selector data/handler (full mode).
 */
export default function CustomerForm({
  formData,
  setFormData,
  compact = false,
  language = 'ar',
  t = {},
  customerFamilies = [],
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
            data-testid="customer-name-input"
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
      {/* Name & Code & Phone & Email */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t.customerName} *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="h-9"
            data-testid="customer-name-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'الكود' : 'Code'}</Label>
          <Input
            value={formData.code}
            className="h-9 font-mono text-sm bg-muted/50"
            readOnly
            placeholder="CL00001"
            data-testid="customer-code-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.phone}</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            dir="ltr"
            className="h-9"
            data-testid="customer-phone-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.email}</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="h-9"
            data-testid="customer-email-input"
          />
        </div>
      </div>

      {/* Type, Discount, Debt Limit, Birthdate */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'التصنيف' : 'Type'}</Label>
          <Select
            value={formData.customer_type}
            onValueChange={(value) => setFormData({ ...formData, customer_type: value })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">{language === 'ar' ? 'جديد' : 'Nouveau'}</SelectItem>
              <SelectItem value="regular">{language === 'ar' ? 'عادي' : 'Régulier'}</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'خصم %' : 'Remise %'}</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={formData.special_discount}
            onChange={(e) => setFormData({ ...formData, special_discount: e.target.value })}
            placeholder="0"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'حد الدين' : 'Limite'}</Label>
          <Input
            type="number"
            min="0"
            value={formData.max_debt_limit}
            onChange={(e) => setFormData({ ...formData, max_debt_limit: e.target.value })}
            placeholder={language === 'ar' ? '∞' : '∞'}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'الميلاد' : 'Naissance'}</Label>
          <Input
            type="date"
            value={formData.birthdate}
            onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
            className="h-9"
          />
        </div>
      </div>

      {/* ID, Commercial Register, Family */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'رقم الهوية' : 'N° ID'}</Label>
          <Input
            value={formData.national_id}
            onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{language === 'ar' ? 'السجل التجاري' : 'RC'}</Label>
          <Input
            value={formData.commercial_register}
            onChange={(e) => setFormData({ ...formData, commercial_register: e.target.value })}
            className="h-9"
          />
        </div>
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
              {customerFamilies.map(family => (
                <SelectItem key={family.id} value={family.id}>
                  {family.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Address & Notes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t.address}</Label>
          <Input
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="h-9"
            data-testid="customer-address-input"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.notes}</Label>
          <Input
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="h-9"
          />
        </div>
      </div>
    </>
  );
}
