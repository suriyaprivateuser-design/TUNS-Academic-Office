import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils/cn';

describe('cn', () => {
  it('keeps a text colour and a custom font size together', () => {
    expect(cn('text-primary-foreground', 'text-body')).toBe('text-primary-foreground text-body');
    expect(cn('text-accent text-label', 'text-caption')).toBe('text-accent text-caption');
  });

  it('lets later design-token classes override earlier ones', () => {
    expect(cn('rounded-card', 'rounded-control')).toBe('rounded-control');
    expect(cn('shadow-card', 'shadow-raised')).toBe('shadow-raised');
    expect(cn('text-foreground', 'text-accent')).toBe('text-accent');
    expect(cn('h-10 px-4', 'h-12')).toBe('px-4 h-12');
  });
});
