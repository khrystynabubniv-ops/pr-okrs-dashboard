import { useEffect } from 'react'
import { X } from 'lucide-react'

const modalSizes = {
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
}

export function Modal({ title, children, onClose, footer, size = 'md' }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--overlay-bg)] px-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full ${modalSizes[size] || modalSizes.md} overflow-hidden rounded-modal bg-surface shadow-modal animate-[modalIn_0.18s_ease]`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-5">
          <h2 id="modal-title" className="font-display text-[19px] font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-button-icon"
            aria-label="Закрити"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-210px)] overflow-y-auto px-6 py-[22px]">
          {children}
        </div>
        {footer ? (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
