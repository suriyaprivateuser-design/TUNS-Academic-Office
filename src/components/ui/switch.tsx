'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border-strong bg-surface-muted p-0.5',
        'transition-colors duration-200 ease-out data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[1.125rem] rounded-full bg-white shadow-control transition-transform duration-200 ease-out data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}
