'use client';

import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';
import { floatingClass } from './popover';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 8,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(floatingClass, 'min-w-52 p-1.5', className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone = 'default',
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { tone?: 'default' | 'danger' }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[0.5rem] px-2.5 py-1.5 text-label outline-none select-none',
        'transition-colors duration-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&_svg]:size-[1.125rem] [&_svg]:shrink-0',
        tone === 'danger'
          ? 'text-danger data-[highlighted]:bg-danger-soft'
          : 'text-foreground data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn('px-2.5 py-1.5 text-caption font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn('my-1.5 h-px bg-border/70', className)} {...props} />;
}
