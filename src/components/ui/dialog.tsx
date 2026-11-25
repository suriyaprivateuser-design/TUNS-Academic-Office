'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlayClass =
  'fixed inset-0 z-50 bg-foreground/35 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-200';

export function DialogContent({
  className,
  children,
  size = 'md',
  hideClose = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideClose?: boolean;
}) {
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
          'rounded-card bg-surface shadow-raised ring-1 ring-border/60 outline-none',
          'duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          width,
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="absolute top-3.5 right-3.5 grid size-9 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground"
            aria-label="ปิด"
          >
            <X className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-6 pt-6 pr-14', className)} {...props} />;
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border/70 px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-heading font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-label text-muted-foreground', className)}
      {...props}
    />
  );
}

/** แผงเลื่อนจากด้านข้าง (ใช้กับเมนูบนมือถือและแผงรายละเอียด) */
export function SheetContent({
  className,
  children,
  side = 'left',
  title,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { side?: 'left' | 'right'; title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(20rem,calc(100%-3rem))] flex-col bg-surface shadow-raised outline-none',
          'duration-250 ease-out-expo data-[state=open]:animate-in data-[state=closed]:animate-out',
          side === 'left'
            ? 'left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
            : 'right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
