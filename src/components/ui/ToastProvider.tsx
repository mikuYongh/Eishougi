import { Toaster, toast } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster 
      position="top-center"
      offset={80}
      expand={false}
      richColors={false}
      toastOptions={{
        className: 'glass-panel !bg-[var(--bg-layer-2)]/90 !border-[var(--glass-border)] !text-[var(--text-primary)] !shadow-[0_8px_30px_rgba(0,0,0,0.5)] !backdrop-blur-xl',
        style: {
          borderRadius: '16px',
          padding: '12px 16px',
        },
        classNames: {
          toast: 'group flex items-center gap-3',
          title: 'text-[14px] font-bold text-[var(--text-primary)]',
          description: 'text-[12px] text-[var(--text-secondary)]',
          actionButton: '!bg-[var(--accent-1)] !text-white hover:!bg-[var(--accent-1)]/80',
          cancelButton: '!bg-[var(--glass-bg-hover)] !text-[var(--text-primary)] hover:!bg-[var(--glass-border-active)]',
          icon: 'text-[var(--text-primary)]'
        }
      }}
    />
  );
}

export { toast };
