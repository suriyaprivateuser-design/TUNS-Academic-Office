import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap select-none',
    'transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-control hover:bg-primary-hover',
        secondary:
          'border border-border-strong bg-surface text-foreground hover:border-primary hover:bg-surface-subtle',
        soft: 'bg-accent-soft text-accent hover:bg-rose-soft',
        ghost: 'text-muted-foreground hover:bg-surface-subtle hover:text-foreground',
        danger: 'bg-danger text-white shadow-control hover:bg-danger/90',
        link: 'h-auto rounded-none p-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-label',
        md: 'h-10 px-4 text-label',
        lg: 'h-11 px-5 text-body',
        icon: 'size-10',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** แสดงตัวหมุนและปิดการกดระหว่างรอผล */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button', disabled: disabled || loading })}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        // Slot รับลูกได้เพียงองค์ประกอบเดียว
        children
      ) : (
        <>
          {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
