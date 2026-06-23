import { useState } from 'react';
import { Button } from '../ui/button';
import { Printer } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import PrintDocumentDialog from './PrintDocumentDialog';

/**
 * زر طباعة لسجل واحد (وصل/فاتورة/سند) مع معاينة قبل الطباعة.
 * docType: 'customer' | 'product' | 'purchase' | 'sale' | 'expense'
 */
export default function PrintButton({
  docType,
  record,
  variant = 'ghost',
  size = 'icon',
  iconOnly = true,
  className = '',
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [open, setOpen] = useState(false);

  const label = ar ? 'طباعة' : 'Imprimer';

  return (
    <>
      <Button
        variant={variant}
        size={iconOnly ? size : 'sm'}
        className={`gap-2 ${className}`}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid={`print-${docType}-btn`}
      >
        <Printer className="h-4 w-4" />
        {!iconOnly && label}
      </Button>
      {open && (
        <PrintDocumentDialog
          open={open}
          onOpenChange={setOpen}
          docType={docType}
          record={record}
        />
      )}
    </>
  );
}
