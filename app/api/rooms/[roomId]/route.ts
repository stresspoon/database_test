import { NextRequest, NextResponse } from 'next/server';
import { SlotSchema, applyBuffer, overlaps, parseYmdAndTime } from '@/lib/util';
import { getRoomWithBlocks } from '@/lib/db';
import type { Slot } from '@/lib/types';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId: roomIdStr } = await context.params;
    const { searchParams } = new URL(req.url);
    const parsed = SlotSchema.safeParse({
      date: searchParams.get('date') ?? '',
      length: searchParams.get('length') ?? '',
      unit: searchParams.get('unit') ?? '',
      buffer: searchParams.get('buffer') ?? '',
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const roomId = Number(roomIdStr);
    if (!Number.isInteger(roomId) || roomId <= 0) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const blocks = await getRoomWithBlocks(roomId, parsed.data.date);

    // Build open/close Date objects based on requested date
    const open = parseYmdAndTime(parsed.data.date, blocks.room.open_time, process.env.TZ || 'UTC');
    const close = parseYmdAndTime(parsed.data.date, blocks.room.close_time, process.env.TZ || 'UTC');
    const now = new Date();

    // Convert TSRANGE strings to Date tuples
    const parseTsRange = (raw: string): [Date, Date] => {
      const trimmed = raw.replace(/[\[\)\s\"]/g, '');
      const [s, e] = trimmed.split(',');
      return [new Date(s), new Date(e)];
    };

    const blackoutRanges: Array<[Date, Date]> = (blocks.blackouts ?? []).map((b) => parseTsRange(String(b.period)));
    const reservationRanges: Array<[Date, Date]> = (blocks.reservations ?? [])
      .filter((r) => r.status === 'confirmed' || r.status === 'ongoing')
      .map((r) => parseTsRange(String(r.period)));
    const holdRanges: Array<[Date, Date]> = (blocks.holds ?? [])
      .filter((h) => new Date(h.expires_at) > now)
      .map((h) => parseTsRange(String(h.period)));

    const unitMs = parsed.data.unit * 60_000;
    const lengthMs = parsed.data.length * 60_000;
    const bufferMin = parsed.data.buffer;

    const slots: Slot[] = [];
    for (let ts = open.getTime(); ts + lengthMs <= close.getTime(); ts += unitMs) {
      const start = new Date(ts);
      const end = new Date(ts + lengthMs);

      // Past guard
      if (start < now) {
        slots.push({ start: start.toISOString(), end: end.toISOString(), available: false, reason: 'outside_hours' });
        continue;
      }

      // Open/close guard
      if (!(start >= open && end <= close)) {
        slots.push({ start: start.toISOString(), end: end.toISOString(), available: false, reason: 'outside_hours' });
        continue;
      }

      const [occStart, occEnd] = applyBuffer([start, end], bufferMin, bufferMin);
      if (occStart < open || occEnd > close) {
        slots.push({ start: start.toISOString(), end: end.toISOString(), available: false, reason: 'buffer_blocked' });
        continue;
      }

      const conflictedByBlackout = blackoutRanges.some((r) => overlaps([start, end], r));
      if (conflictedByBlackout) {
        slots.push({ start: start.toISOString(), end: end.toISOString(), available: false, reason: 'blackout' });
        continue;
      }
      const conflicted = reservationRanges.some((r) => overlaps([start, end], r)) || holdRanges.some((r) => overlaps([start, end], r));
      if (conflicted) {
        slots.push({ start: start.toISOString(), end: end.toISOString(), available: false, reason: 'conflict' });
        continue;
      }

      slots.push({ start: start.toISOString(), end: end.toISOString(), available: true });
    }

    return NextResponse.json({
      slots,
      rules: {
        unit: parsed.data.unit,
        buffer: parsed.data.buffer,
        openTime: blocks.room.open_time,
        closeTime: blocks.room.close_time,
      },
    });
  } catch {
    return NextResponse.json({ error: 'system_error' }, { status: 500 });
  }
}


