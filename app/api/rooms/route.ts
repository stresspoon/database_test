import { NextRequest, NextResponse } from 'next/server';
import { SearchSchema } from '@/lib/util';
import { findRoomsByAvailability } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = SearchSchema.safeParse({
      date: searchParams.get('date') ?? '',
      start: searchParams.get('start') ?? '',
      end: searchParams.get('end') ?? '',
      people: searchParams.get('people') ?? '',
      location: searchParams.get('location') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const result = await findRoomsByAvailability(parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'system_error' }, { status: 500 });
  }
}


