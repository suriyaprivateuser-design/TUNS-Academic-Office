'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AppIcon } from '@/components/shared/app-icon';
import { EmptyState } from '@/components/shared/empty-state';
import { ServiceTile, type ServiceTileColor } from '@/components/shared/service-tile';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';

export interface LauncherService {
  id: string;
  name: string;
  icon: string;
  color: ServiceTileColor;
  href: string;
  external: boolean;
}

/** App Launcher ที่ Topbar — เข้าถึงระบบอื่นได้จากทุกหน้า (ข้อ 19) */
export function AppLauncher({ services }: { services: readonly LauncherService[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip label="ระบบและบริการวิชาการ" side="bottom">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="เปิดรายการระบบและบริการวิชาการ">
            <AppIcon name="serviceHub" size={20} />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[21.5rem] p-0">
        <p className="border-b border-border/70 px-4 py-3 text-label font-semibold">ระบบที่ใช้บ่อย</p>
        {services.length === 0 ? (
          <EmptyState
            compact
            title="ยังไม่มีระบบที่พร้อมเปิด"
            description="ผู้ดูแลสามารถเพิ่มลิงก์ได้ที่หน้าจัดการลิงก์"
          />
        ) : (
          <ul className="grid grid-cols-3 gap-1 p-2">
            {services.map((service) => (
              <li key={service.id}>
                <a
                  href={`${service.href}?from=launcher`}
                  target={service.external ? '_blank' : undefined}
                  rel={service.external ? 'noopener noreferrer' : undefined}
                  onClick={() => setOpen(false)}
                  className="flex h-full flex-col items-center gap-2 rounded-[0.75rem] px-1.5 py-3 text-center transition-colors duration-150 hover:bg-surface-subtle"
                >
                  <span className="relative">
                    <ServiceTile icon={service.icon} color={service.color} size="sm" />
                    {service.external ? (
                      <ArrowUpRight
                        aria-hidden
                        className="absolute -top-1 -right-1.5 size-3.5 rounded-full bg-surface text-muted-foreground"
                        strokeWidth={2}
                      />
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-caption leading-snug text-foreground">
                    {service.name}
                    {service.external ? <span className="sr-only"> (เปิดในแท็บใหม่)</span> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border/70 p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/services" onClick={() => setOpen(false)}>
              ดูระบบและบริการทั้งหมด
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
