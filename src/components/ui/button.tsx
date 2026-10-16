import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[3px] border text-xs font-normal tracking-[0.12em] uppercase transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
        amber: 'border-zinc-500 bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
        ghost: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)

Button.displayName = 'Button'

export { Button, buttonVariants }
