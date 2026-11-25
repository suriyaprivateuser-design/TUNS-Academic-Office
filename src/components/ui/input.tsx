import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

export const fieldClass = [
  'w-full rounded-input border border-border-strong bg-surface px-3 text-body text-foreground',
  'transition-[border-color,box-shadow] duration-150 ease-out',
  'hover:border-primary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20',
  'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-70',
  'aria-invalid:border-danger aria-invalid:ring-danger/15',
].join(' ');

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn(fieldClass, 'h-10', className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(fieldClass, 'min-h-20 py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
}
