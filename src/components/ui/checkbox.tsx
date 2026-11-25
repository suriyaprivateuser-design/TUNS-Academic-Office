'use client';

import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer grid size-[1.125rem] shrink-0 place-items-center rounded-[0.3125rem] border border-border-strong bg-surface',
        'transition-[background-color,border-color] duration-150 ease-out hover:border-accent',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-white',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-white',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3.5" strokeWidth={3} aria-hidden />
        ) : (
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
