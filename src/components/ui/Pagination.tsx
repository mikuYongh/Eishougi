import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const handlePrev = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  // Generate page numbers with ellipses
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always include 1
      pages.push(1);

      if (currentPage <= 3) {
        pages.push(2, 3, 4, '...');
      } else if (currentPage >= totalPages - 2) {
        pages.push('...', totalPages - 3, totalPages - 2, totalPages - 1);
      } else {
        pages.push('...', currentPage - 1, currentPage, currentPage + 1, '...');
      }

      // Always include totalPages
      pages.push(totalPages);
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 w-full py-4">
      <button
        onClick={handlePrev}
        disabled={currentPage === 1}
        className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-[var(--glass-bg)] transition-all"
        title="上一页"
      >
        <ChevronLeft size={16} />
        <span className="hidden sm:inline ml-1">上一页</span>
      </button>

      <div className="flex items-center gap-1">
        {pageNumbers.map((page, index) => {
          if (page === '...') {
            return (
              <div key={`ellipsis-${index}`} className="flex items-center justify-center w-6 sm:w-8 text-[var(--text-secondary)]">
                <MoreHorizontal size={16} />
              </div>
            );
          }

          const isCurrent = page === currentPage;
          return (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className={`min-w-[28px] sm:min-w-[32px] h-8 flex items-center justify-center rounded-lg text-[13px] sm:text-sm font-medium transition-all ${
                isCurrent
                  ? 'bg-gradient-to-br from-[var(--accent-1)] to-[var(--accent-2)] text-white shadow-lg border border-[var(--accent-1)]/30'
                  : 'text-[var(--text-secondary)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]'
              }`}
            >
              {page}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleNext}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-[var(--glass-bg)] transition-all"
        title="下一页"
      >
        <span className="hidden sm:inline mr-1">下一页</span>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
