import { Button } from './ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight 
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useLanguage } from '../contexts/LanguageContext';

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  showItemsPerPage = true,
  itemsPerPageOptions = [10, 20, 50, 100],
  className = ""
}) {
  const { language } = useLanguage();
  
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    
    return pages;
  };

  if (totalPages <= 1 && !showItemsPerPage) return null;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`} data-testid="pagination">
      {/* Items info */}
      <div className="text-sm text-muted-foreground">
        {language === 'ar' 
          ? `عرض ${startItem}-${endItem} من ${totalItems}`
          : `Affichage ${startItem}-${endItem} sur ${totalItems}`
        }
      </div>

      <div className="flex items-center gap-4">
        {/* Items per page selector */}
        {showItemsPerPage && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {language === 'ar' ? 'عرض:' : 'Afficher:'}
            </span>
            <Select 
              value={itemsPerPage.toString()} 
              onValueChange={(v) => onItemsPerPageChange(parseInt(v))}
            >
              <SelectTrigger className="w-[70px] h-8" data-testid="items-per-page-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemsPerPageOptions.map(option => (
                  <SelectItem key={option} value={option.toString()}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page navigation */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            {/* First page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              data-testid="first-page-btn"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            
            {/* Previous page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              data-testid="prev-page-btn"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
              {getPageNumbers().map((page, idx) => (
                page === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onPageChange(page)}
                    data-testid={`page-${page}-btn`}
                  >
                    {page}
                  </Button>
                )
              ))}
            </div>

            {/* Mobile page indicator */}
            <div className="sm:hidden px-3 text-sm">
              {currentPage} / {totalPages}
            </div>

            {/* Next page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              data-testid="next-page-btn"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Last page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              data-testid="last-page-btn"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Pagination;
