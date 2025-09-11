import { NextRequest, NextResponse } from 'next/server';
import { MySchema } from '@/lib/util';
import { authAndList, cancelReservation } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = MySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const data = parsed.data;
    if (data.action === 'list') {
      const result = await authAndList({ phone: data.phone, password: data.password });
      return NextResponse.json(result);
    } else if (data.action === 'cancel') {
      await cancelReservation({ phone: data.phone, password: data.password, reservationId: data.reservationId });
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'auth_failed') {
      return NextResponse.json({ error: 'auth_failed' }, { status: 401 });
    }
    if (code === 'policy_violation') {
      return NextResponse.json({ error: 'policy_violation' }, { status: 422 });
    }
    if (code === 'conflict') {
      return NextResponse.json({ error: 'conflict' }, { status: 409 });
    }
    return NextResponse.json({ error: 'system_error' }, { status: 500 });
  }
}


