'use client';

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';

/** Toast Notification กลาง — สีและตัวอักษรมาจาก Design Token */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      duration={5000}
      icons={{
        success: <CircleCheck className="size-5 text-success" />,
        error: <CircleAlert className="size-5 text-danger" />,
        warning: <TriangleAlert className="size-5 text-warning" />,
        info: <Info className="size-5 text-info" />,
        loading: <LoaderCircle className="size-5 animate-spin text-accent" />,
      }}
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
          background: 'var(--surface)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: '0.875rem',
          boxShadow: 'var(--shadow-raised)',
          fontSize: '0.9375rem',
        },
      }}
    />
  );
}
