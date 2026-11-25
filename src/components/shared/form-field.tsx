import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

/**
 * ช่องกรอกมาตรฐาน: ป้ายชื่อ + ช่องกรอก + คำแนะนำ + ข้อผิดพลาด
 * ผู้เรียกส่ง id ของช่องกรอกมาเพื่อผูกกับป้ายชื่อและข้อความผิดพลาด (aria-describedby = `${id}-error`)
 */
export function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-1 text-caption font-normal text-accent">(จำเป็น)</span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <FormValidationMessage id={`${id}-error`}>{error}</FormValidationMessage>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormValidationMessage({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-caption font-medium text-danger">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
      {children}
    </p>
  );
}
