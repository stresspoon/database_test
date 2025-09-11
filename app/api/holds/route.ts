import { NextRequest, NextResponse } from 'next/server';
import { HoldSchema } from '@/lib/util';
import { createHold } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = HoldSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const result = await createHold(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'conflict') {
      return NextResponse.json({ error: 'conflict' }, { status: 409 });
    }
    return NextResponse.json({ error: 'system_error', message: String(e) }, { status: 500 });
  }
}


