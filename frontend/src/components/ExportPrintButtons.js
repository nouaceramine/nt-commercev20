import { Button } from './ui/button';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { formatShortDate } from '../utils/globalDateFormatter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner';

/**
 * ExportPrintButtons - Reusable component for export and print functionality
 * @param {Object} props
 * @param {Array} props.data - Data to export
 * @param {Array} props.columns - Column definitions [{key: 'id', label: 'ID'}, ...]
 * @param {string} props.filename - Export filename without extension
 * @param {string} props.title - Title for PDF header
 * @param {string} props.language - 'ar' or 'fr'
 */

const escapeHtml = (value) => {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
export function ExportPrintButtons({ 
  data = [], 
  columns = [], 
  filename = 'export',
  title = 'Report',
  language = 'ar' 
}) {
  
  // Export to CSV
  const exportToCSV = () => {
    if (!data.length) {
      toast.error(language === 'ar' ? 'لا توجد بيانات للتصدير' : 'Aucune donnée à exporter');
      return;
    }
    
    const headers = columns.map(c => c.label).join(',');
    const rows = data.map(item => 
      columns.map(c => {
        let val = item[c.key];
        if (typeof val === 'string' && val.includes(',')) {
          val = `"${val}"`;
        }
        return val ?? '';
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success(language === 'ar' ? 'تم التصدير بنجاح' : 'Export réussi');
  };

  // Export to Excel (XLS format)
  const exportToExcel = () => {
    if (!data.length) {
      toast.error(language === 'ar' ? 'لا توجد بيانات للتصدير' : 'Aucune donnée à exporter');
      return;
    }

    // Create HTML table for Excel — values are HTML-escaped to prevent XSS
    const headers = columns.map(c => `<th style="background:#4472C4;color:white;padding:8px;border:1px solid #ccc;">${escapeHtml(c.label)}</th>`).join('');
    const rows = data.map(item =>
      `<tr>${columns.map(c => `<td style="padding:6px;border:1px solid #ccc;">${escapeHtml(item[c.key])}</td>`).join('')}</tr>`
    ).join('');
    
    const table = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
      <x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions>
      </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body><table dir="rtl"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>
    `;
    
    const blob = new Blob([table], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success(language === 'ar' ? 'تم التصدير إلى Excel' : 'Export Excel réussi');
  };

  // Print / PDF
  const handlePrint = () => {
    if (!data.length) {
      toast.error(language === 'ar' ? 'لا توجد بيانات للطباعة' : 'Aucune donnée à imprimer');
      return;
    }

    const headers = columns.map(c => `<th style="background:#333;color:white;padding:10px;text-align:right;">${c.label}</th>`).join('');
    const rows = data.map(item => 
      `<tr>${columns.map(c => `<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${item[c.key] ?? ''}</td>`).join('')}</tr>`
    ).join('');

    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; direction: rtl; }
          h1 { text-align: center; color: #333; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: right; }
          th { background: #333; color: white; }
          tr:nth-child(even) { background: #f9f9f9; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p style="text-align:center;color:#666;">${formatShortDate(new Date())}</p>
        <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
        <div class="footer">${language === 'ar' ? 'تم الطباعة من نظام NT' : 'Imprimé depuis NT System'}</div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="flex gap-2">
      {/* Print Button */}
      <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
        <Printer className="h-4 w-4" />
        {language === 'ar' ? 'طباعة' : 'Imprimer'}
      </Button>
      
      {/* Export Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            {language === 'ar' ? 'تصدير' : 'Exporter'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={exportToExcel} className="gap-2 cursor-pointer">
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Excel (.xls)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportToCSV} className="gap-2 cursor-pointer">
            <FileText className="h-4 w-4 text-blue-600" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePrint} className="gap-2 cursor-pointer">
            <FileText className="h-4 w-4 text-red-600" />
            PDF / {language === 'ar' ? 'طباعة' : 'Imprimer'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
