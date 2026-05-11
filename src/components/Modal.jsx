import { X } from 'lucide-react'

export function Modal({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Закрити"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-132px)] overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
