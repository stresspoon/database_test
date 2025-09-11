import { NextRequest, NextResponse } from 'next/server';
import { SlotSchema } from '@/lib/util';
import { getRoomWithBlocks } from '@/lib/db';

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
    // NOTE: For brevity, slots calculation is simplified placeholder; in production, compute with business rules.
    return NextResponse.json({
      slots: [],
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


