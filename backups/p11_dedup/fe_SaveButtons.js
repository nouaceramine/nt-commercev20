import { Save, Plus } from 'lucide-react';
import { Button } from './ui/button';

/**
 * SaveButtons - Reusable save buttons component
 * Shows "Save" and "Save & Create New" buttons
 */
export function SaveButtons({
  onSave,
  onSaveAndNew,
  loading = false,
  disabled = false,
  saveLabel,
  saveAndNewLabel,
  language = 'ar',
  showSaveAndNew = true,
  className = ''
}) {
  const defaultSaveLabel = language === 'ar' ? 'حفظ' : 'Enregistrer';
  const defaultSaveAndNewLabel = language === 'ar' ? 'حفظ وإنشاء جديد' : 'Enregistrer et créer nouveau';

  return (
    <div className={`flex gap-2 ${className}`}>
      {showSaveAndNew && (
        <Button
          type="button"
          variant="outline"
          onClick={onSaveAndNew}
          disabled={loading || disabled}
          className="gap-2"
          data-testid="save-and-new-btn"
        >
          <Plus className="h-4 w-4" />
          {saveAndNewLabel || defaultSaveAndNewLabel}
        </Button>
      )}
      <Button
        type="submit"
        onClick={onSave}
        disabled={loading || disabled}
        className="gap-2"
        data-testid="save-btn"
      >
        <Save className="h-4 w-4" />
        {loading ? (language === 'ar' ? 'جاري الحفظ...' : 'Enregistrement...') : (saveLabel || defaultSaveLabel)}
      </Button>
    </div>
  );
}

export default SaveButtons;
