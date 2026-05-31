import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const variants = cva(
  'inline-flex items-center justify-center rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue text-white hover:bg-blue/90',
        outline: 'border border-border bg-transparent hover:bg-card',
        ghost: 'bg-transparent hover:bg-card text-text-secondary hover:text-text-primary',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

interface Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(variants({ variant, size }), className)} ref={ref} {...props} />
  ),
)
Button.displayName = 'Button'
