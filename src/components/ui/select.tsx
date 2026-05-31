import { useState, useRef, useEffect, createContext, useContext, forwardRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface Ctx {
  open: boolean
  toggle: (rect?: DOMRect) => void
  value: string
  onValueChange: (v: string) => void
  triggerRect: DOMRect | null
}

const SelectCtx = createContext<Ctx | null>(null)

export function Select({ value, onValueChange, children }: {
  value: string
  onValueChange: (v: string) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = useCallback((rect?: DOMRect) => {
    if (!open && rect) setTriggerRect(rect)
    setOpen((prev) => !prev)
  }, [open])

  return (
    <SelectCtx.Provider value={{ open, toggle, value, onValueChange, triggerRect }}>
      <div className="relative" ref={ref}>
        {children}
      </div>
    </SelectCtx.Provider>
  )
}

export const SelectTrigger = forwardRef<HTMLButtonElement, {
  className?: string; children?: React.ReactNode; disabled?: boolean
}>(({ className, children, disabled }, ref) => {
  const ctx = useContext(SelectCtx)
  const localRef = useRef<HTMLButtonElement | null>(null)

  const handleClick = () => {
    const rect = localRef.current?.getBoundingClientRect()
    ctx?.toggle(rect)
  }

  // Merge refs
  const setRefs = (el: HTMLButtonElement | null) => {
    localRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el
  }

  return (
    <button
      ref={setRefs}
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'flex w-full items-center justify-between rounded border border-border bg-root px-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue disabled:opacity-50 cursor-pointer',
        className,
      )}
    >
      <SelectValue>{children}</SelectValue>
      <ChevronDown size={14} className={cn('text-text-muted ml-2 shrink-0 transition-transform', ctx?.open && 'rotate-180')} />
    </button>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

export function SelectValue({ children }: { children?: React.ReactNode }) {
  const ctx = useContext(SelectCtx)
  return <span className={ctx?.value ? 'text-text-primary' : 'text-text-muted'}>{children || ctx?.value || '选择…'}</span>
}

export function SelectContent({ children, className }: {
  children: React.ReactNode
  onSelect?: (v: string) => void
  className?: string
}) {
  const ctx = useContext(SelectCtx)
  if (!ctx?.open) return null

  const rect = ctx.triggerRect
  const style: React.CSSProperties = rect ? {
    position: 'fixed',
    left: rect.left,
    top: rect.bottom + 4,
    width: rect.width,
    zIndex: 100,
  } : {}

  const handleClick = () => {
    // handled by individual items
  }

  return createPortal(
    <div
      style={style}
      className={cn('rounded border border-border bg-surface shadow-2xl max-h-48 overflow-y-auto', className)}
    >
      {children}
    </div>,
    document.body,
  )
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useContext(SelectCtx)
  const sel = ctx?.value === value
  return (
    <div
      data-value={value}
      onClick={() => { ctx?.onValueChange(value); ctx?.toggle() }}
      className={cn('px-2.5 py-1.5 text-sm cursor-pointer', sel ? 'bg-blue/20 text-blue-light' : 'text-text-primary hover:bg-blue/10')}
    >
      {children}
    </div>
  )
}
