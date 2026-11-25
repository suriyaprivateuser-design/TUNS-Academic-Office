'use client';

import { ChartColumn, Table2 } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';

export interface MonthlyPoint {
  /** YYYY-MM */
  month: string;
  /** ป้ายเดือนแบบย่อ จัดรูปที่ Server เพื่อให้ตรงกันทุกเครื่อง เช่น “พ.ย. 69” */
  label: string;
  /** ชื่อเดือนเต็ม สำหรับ tooltip และตาราง เช่น “พฤศจิกายน 2569” */
  fullLabel: string;
  opens: number;
}

const formatCount = (value: number) => value.toLocaleString('th-TH');

/**
 * จำนวนครั้งที่เปิดลิงก์รายเดือน — ซีรีส์เดียว สีเดียว (ชื่อกราฟบอกว่าแท่งคืออะไร จึงไม่มี legend)
 * ทุกค่ามีในมุมมองตารางด้วย tooltip เป็นเพียงตัวช่วย ไม่ใช่ทางเดียวที่จะอ่านค่าได้
 */
export function MonthlyOpensChart({ data }: { data: readonly MonthlyPoint[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const total = data.reduce((sum, point) => sum + point.opens, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-muted-foreground">
          รวม {formatCount(total)} ครั้ง ใน {data.length} เดือน
        </p>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={view === 'table'}
          onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
        >
          {view === 'chart' ? (
            <Table2 className="size-4" strokeWidth={1.75} aria-hidden />
          ) : (
            <ChartColumn className="size-4" strokeWidth={1.75} aria-hidden />
          )}
          {view === 'chart' ? 'ดูเป็นตาราง' : 'ดูเป็นกราฟ'}
        </Button>
      </div>

      {view === 'chart' ? (
        <div className="h-64 w-full" role="img" aria-label={`กราฟแท่งจำนวนครั้งที่เปิดลิงก์รายเดือน รวม ${formatCount(total)} ครั้ง`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data as MonthlyPoint[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickFormatter={formatCount}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-subtle)' }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as MonthlyPoint | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <div className="rounded-[0.625rem] bg-surface px-3 py-2 shadow-raised ring-1 ring-border/70">
                      <p className="text-subheading font-semibold text-foreground">{formatCount(point.opens)} ครั้ง</p>
                      <p className="text-caption text-muted-foreground">{point.fullLabel}</p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="opens"
                name="จำนวนครั้งที่เปิดลิงก์"
                fill="var(--chart-1)"
                activeBar={{ fill: 'var(--accent)' }}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-64 text-label">
            <caption className="sr-only">จำนวนครั้งที่เปิดลิงก์รายเดือน</caption>
            <thead>
              <tr className="border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  เดือน
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  จำนวนครั้งที่เปิดลิงก์
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.month} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    {point.fullLabel}
                  </th>
                  <td className="py-2 text-right tabular-nums">{formatCount(point.opens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
