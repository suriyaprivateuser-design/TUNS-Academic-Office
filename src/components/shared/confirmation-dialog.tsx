'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * กล่องยืนยันสำหรับการกระทำที่ย้อนกลับไม่ได้หรือมีผลต่อผู้อื่น (อนุมัติ ยกเลิก จัดเก็บถาวร)
 * ปุ่มยืนยันบอกการกระทำตรง ๆ ไม่ใช้คำว่า “ตกลง”
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'ยกเลิก',
  tone = 'primary',
  loading = false,
  onConfirm,
  children,
  confirmDisabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (loading ? undefined : onOpenChange(next))}>
      <DialogContent size="sm" hideClose={loading}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children ? <DialogBody>{children}</DialogBody> : <div className="h-5" />}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
