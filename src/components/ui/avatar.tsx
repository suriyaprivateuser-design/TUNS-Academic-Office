'use client';

import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils/cn';

export function Avatar({
  src,
  initials,
  name,
  className,
}: {
  src?: string | null;
  initials: string;
  name: string;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex size-10 shrink-0 overflow-hidden rounded-full bg-accent-soft ring-1 ring-rose-muted/60',
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        aria-label={name}
        className="grid size-full place-items-center text-label font-semibold text-accent"
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
