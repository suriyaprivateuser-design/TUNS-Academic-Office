'use client';

import { StarOff } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { toggleFavoriteAction } from './actions';

export function RemoveFavoriteButton({ serviceId, name }: { serviceId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Tooltip label="นำออกจากรายการโปรด">
      <Button
        variant="ghost"
        size="icon-sm"
        loading={pending}
        aria-label={`นำ ${name} ออกจากรายการโปรด`}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleFavoriteAction(serviceId, false);
            if (result.ok) toast.success('นำออกจากรายการโปรดแล้ว');
            else toast.error(result.error.message);
          })
        }
      >
        {pending ? null : <StarOff className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />}
      </Button>
    </Tooltip>
  );
}
