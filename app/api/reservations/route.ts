import { NextRequest, NextResponse } from 'next/server';
import { ReserveSchema } from '@/lib/util';
import { confirmReservation } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = ReserveSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const result = await confirmReservation(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'hold_expired') {
      return NextResponse.json({ error: 'hold_expired' }, { status: 410 });
    }
    if (code === 'conflict') {
      return NextResponse.json({ error: 'conflict' }, { status: 409 });
    }
    return NextResponse.json({ error: 'system_error' }, { status: 500 });
  }
}


