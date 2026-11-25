'use client';

import { Command } from 'cmdk';
import { ArrowUpRight, Clock, CornerDownLeft, LoaderCircle, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/shared/app-icon';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { NavGroup } from '@/lib/navigation';
import type { SearchGroup, SearchResult } from '@/services/search';

const RECENT_KEY = 'tuns:recent-searches';
const itemClass =
  'flex cursor-pointer items-center gap-3 rounded-[0.625rem] px-3 py-2.5 text-label outline-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent';
const headingClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

function readRecent(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string): void {
  try {
    const next = [query, ...readRecent().filter((entry) => entry !== query)].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ที่เก็บของเบราว์เซอร์ใช้ไม่ได้ (โหมดส่วนตัว) — ข้ามได้
  }
}

/**
 * Global Search (ข้อ 29): เปิดได้จากทุกหน้าด้วย Ctrl+K / ⌘K
 * ผลลัพธ์มาจาก /api/search ซึ่งกรองสิทธิ์ที่ฝั่ง Server แล้ว
 */
export function GlobalSearch({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly NavGroup[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchGroup[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [recent, setRecent] = useState<string[]>([]);
  const requestId = useRef(0);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) setRecent(readRecent());
      else {
        setQuery('');
        setResults([]);
        setStatus('idle');
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handleOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleOpenChange]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestId.current += 1;
      return;
    }
    const current = (requestId.current += 1);
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          headers: { accept: 'application/json' },
        });
        if (current !== requestId.current) return;
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { groups: SearchGroup[] };
        setResults(data.groups);
        setStatus('done');
      } catch {
        if (current === requestId.current) setStatus('error');
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  const pages = useMemo(() => {
    const items = groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
    if (!trimmed) return items.slice(0, 6);
    const needle = trimmed.toLowerCase();
    return items.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(needle)).slice(0, 5);
  }, [groups, trimmed]);

  const go = (result: Pick<SearchResult, 'href' | 'external'>) => {
    if (searching) saveRecent(trimmed);
    handleOpenChange(false);
    if (result.external) window.open(result.href, '_blank', 'noopener,noreferrer');
    else router.push(result.href);
  };

  const hasResults = results.some((group) => group.results.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg" hideClose className="top-[12vh] translate-y-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">ค้นหาในระบบ</DialogTitle>
        <DialogDescription className="sr-only">
          ค้นหาระบบ เอกสาร เลขอ้างอิง และกิจกรรม ใช้ลูกศรขึ้นลงเพื่อเลือก และ Enter เพื่อเปิด
        </DialogDescription>
        <Command shouldFilter={false} label="ค้นหาในระบบ" className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b border-border/70 px-4">
            {status === 'loading' && searching ? (
              <LoaderCircle className="size-5 shrink-0 animate-spin text-accent" aria-hidden />
            ) : (
              <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            )}
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="ค้นหาระบบ เอกสาร เลขอ้างอิง หรือชื่อกิจกรรม"
              className="h-14 min-w-0 flex-1 bg-transparent text-body outline-none"
            />
            <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-caption text-muted-foreground sm:block">
              Esc
            </kbd>
          </div>
          <Command.List className="max-h-[min(26rem,60dvh)] overflow-y-auto p-2">
            {!searching && recent.length > 0 ? (
              <Command.Group heading="ค้นหาล่าสุด" className={headingClass}>
                {recent.map((entry) => (
                  <Command.Item key={entry} value={`recent-${entry}`} onSelect={() => setQuery(entry)} className={itemClass}>
                    <Clock className="size-[1.125rem] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                    <span className="truncate">{entry}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {pages.length > 0 ? (
              <Command.Group heading={searching ? 'หน้าในระบบ' : 'ไปที่'} className={headingClass}>
                {pages.map((page) => (
                  <Command.Item
                    key={page.key}
                    value={`page-${page.key}`}
                    onSelect={() => go({ href: page.path, external: false })}
                    className={itemClass}
                  >
                    <AppIcon name={page.icon} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{page.label}</span>
                    <span className="hidden text-caption text-muted-foreground sm:block">{page.group}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {searching
              ? results.map((group) => (
                  <Command.Group key={group.id} heading={group.label} className={headingClass}>
                    {group.results.map((result) => (
                      <Command.Item
                        key={`${group.id}-${result.id}`}
                        value={`${group.id}-${result.id}`}
                        onSelect={() => go(result)}
                        className={itemClass}
                      >
                        <AppIcon name={result.icon} className="shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{result.title}</span>
                          {result.subtitle ? (
                            <span className="block truncate text-caption text-muted-foreground">{result.subtitle}</span>
                          ) : null}
                        </span>
                        {result.external ? (
                          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-label="เปิดในแท็บใหม่" />
                        ) : (
                          <CornerDownLeft className="size-4 shrink-0 text-muted-foreground opacity-0 [[data-selected=true]_&]:opacity-100" aria-hidden />
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))
              : null}

            {searching && status === 'done' && !hasResults && pages.length === 0 ? (
              <p className="px-4 py-10 text-center text-label text-muted-foreground" role="status">
                ไม่พบรายการที่ตรงกับ “{trimmed}” ลองใช้คำที่สั้นลง หรือค้นด้วยเลขอ้างอิง เช่น CL-2569-0001
              </p>
            ) : null}
            {searching && status === 'error' ? (
              <p className="px-4 py-10 text-center text-label text-danger" role="alert">
                ค้นหาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
              </p>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
