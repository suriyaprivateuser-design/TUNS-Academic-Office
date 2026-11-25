import { Skeleton } from '@/components/ui/skeleton';

/** โครงระหว่างรอข้อมูลของหน้า — รูปทรงใกล้เคียงหน้าจริง (หัวเรื่อง + แถบเครื่องมือ + รายการ) */
export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="กำลังโหลด" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-5 w-[28rem] max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-input" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-card" />
        ))}
      </div>
    </div>
  );
}
