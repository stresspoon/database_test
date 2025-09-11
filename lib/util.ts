import { z } from 'zod';

// Time utilities
export function snapToUnit(date: Date, unitMin: number): Date {
  if (unitMin <= 0) throw new Error('unitMin must be > 0');
  const ms = date.getTime();
  const unitMs = unitMin * 60_000;
  const snapped = Math.floor(ms / unitMs) * unitMs;
  return new Date(snapped);
}

export function rangeIsValid(
  start: Date,
  end: Date,
  now: Date,
  openTimeHHMM: string,
  closeTimeHHMM: string
): boolean {
  if (!(start instanceof Date) || !(end instanceof Date) || !(now instanceof Date)) return false;
  if (!(start < end)) return false; // [start,end)
  if (!(start >= now)) return false;
  const [openH, openM] = openTimeHHMM.split(':').map((v) => parseInt(v, 10));
  const [closeH, closeM] = closeTimeHHMM.split(':').map((v) => parseInt(v, 10));
  const open = new Date(start);
  open.setHours(openH, openM, 0, 0);
  const close = new Date(start);
  close.setHours(closeH, closeM, 0, 0);
  return start >= open && end <= close;
}

export function applyBuffer(range: [Date, Date], beforeMin: number, afterMin: number): [Date, Date] {
  const [s, e] = range;
  const start = new Date(s.getTime() - beforeMin * 60_000);
  const end = new Date(e.getTime() + afterMin * 60_000);
  return [start, end];
}

// Zod Schemas
export const SearchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  people: z.coerce.number().int().positive(),
  location: z.string().optional(),
});

export const SlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  length: z.coerce.number().int().positive(),
  unit: z.coerce.number().int().positive(),
  buffer: z.coerce.number().int().min(0),
});

export const HoldSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const ReserveSchema = z.object({
  holdToken: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(8),
  password: z.string().min(8),
});

export const MySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), phone: z.string().min(8), password: z.string().min(8) }),
  z.object({ action: z.literal('cancel'), phone: z.string().min(8), password: z.string().min(8), reservationId: z.coerce.number().int().positive() }),
]);

export type SearchInput = z.infer<typeof SearchSchema>;
export type SlotInput = z.infer<typeof SlotSchema>;
export type HoldInput = z.infer<typeof HoldSchema>;
export type ReserveInput = z.infer<typeof ReserveSchema>;
export type MyInput = z.infer<typeof MySchema>;

export function toIso(date: Date): string {
  return date.toISOString();
}

export function parseYmdAndTime(dateYmd: string, timeHHMM: string, tz: string): Date {
  // tz is provided for future extension; here we use local server TZ (TZ env)
  const [y, m, d] = dateYmd.split('-').map((v) => parseInt(v, 10));
  const [hh, mm] = timeHHMM.split(':').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return dt;
}

export function overlaps(a: [Date, Date], b: [Date, Date]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}


