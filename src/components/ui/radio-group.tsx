export function RadioGroup({ value, onValueChange, className, children }: {
  value: string
  onValueChange: (v: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}

export function RadioGroupItem({ value: itemValue, ...props }: { value: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="radio" value={itemValue} className="sr-only" tabIndex={-1} {...props} />
}
