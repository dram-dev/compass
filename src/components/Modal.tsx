import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) d.close();
  }, [open]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className="w-[min(92vw,640px)] rounded border border-ink bg-paper p-0 font-sans text-[15px] leading-[1.55] text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[21px]">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost !px-3 !py-1"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>,
    document.body,
  );
}
