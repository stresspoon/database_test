import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { toIso } from './util';
import type {
  AvailabilityResult,
  AvailabilityResultRoom,
  AvailabilitySearchParams,
  HoldCreateParams,
  HoldCreateResult,
  MyCancelParams,
  MyListParams,
  MyListResult,
  ReservationConfirmParams,
  ReservationConfirmResult,
  RoomBlocks,
  Slot,
  TsRange,
} from './types';
import { hashPhone, verifyPassword } from './auth';

let _supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase environment variables not set');
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

export async function findRoomsByAvailability(
  params: AvailabilitySearchParams
): Promise<AvailabilityResult> {
  const asOf = new Date();
  // Very simplified: filter by capacity/location/is_active only. Overlap exclusion is done by server-side function ideally.
  const sb = getSupabase();
  const { data: rooms, error } = await sb
    .from('rooms')
    .select('id,name,location,capacity')
    .eq('is_active', true)
    .gte('capacity', params.people)
    .ilike('location', params.location ? `%${params.location}%` : '%');
  if (error) throw error;
  const mapped: AvailabilityResultRoom[] = (rooms ?? []).map((r) => ({
    id: r.id as number,
    name: r.name as string,
    location: r.location as string,
    capacity: r.capacity as number,
  }));
  return { rooms: mapped, asOf: toIso(asOf) };
}

export async function getRoomWithBlocks(roomId: number, date: string): Promise<RoomBlocks> {
  const sb = getSupabase();
  const [{ data: room }, { data: reservations }, { data: holds }, { data: blackouts }] = await Promise.all([
    sb.from('rooms').select('*').eq('id', roomId).single(),
    sb
      .from('reservations')
      .select('id, period, status')
      .eq('room_id', roomId),
    sb
      .from('holds')
      .select('id, period, expires_at')
      .eq('room_id', roomId),
    sb
      .from('room_blackouts')
      .select('id, period')
      .eq('room_id', roomId),
  ]);
  if (!room) throw new Error('room_not_found');
  return {
    room: {
      id: room.id,
      name: room.name,
      location: room.location,
      capacity: room.capacity,
      open_time: room.open_time,
      close_time: room.close_time,
    },
    reservations: (reservations ?? []) as unknown as RoomBlocks['reservations'],
    holds: (holds ?? []) as unknown as RoomBlocks['holds'],
    blackouts: (blackouts ?? []) as unknown as RoomBlocks['blackouts'],
  };
}

export async function createHold(params: HoldCreateParams): Promise<HoldCreateResult> {
  const token = uuidv4();
  const ttlMinutes = 10;
  const expires = new Date(Date.now() + ttlMinutes * 60_000);

  const sb = getSupabase();
  const { error } = await sb.from('holds').insert({
    room_id: params.roomId,
    period: `["${params.start}","${params.end}")`,
    hold_token: token,
    expires_at: expires.toISOString(),
  });
  if (error) {
    if (String(error.message).includes('unique') || String(error.message).includes('overlap')) {
      const err = new Error('conflict') as Error & { code?: string };
      err.code = 'conflict';
      throw err;
    }
    throw error;
  }
  return { token, expiresAt: expires.toISOString() };
}

export async function confirmReservation(params: ReservationConfirmParams): Promise<ReservationConfirmResult> {
  // Validate hold
  const sb = getSupabase();
  const { data: hold, error: holdErr } = await sb
    .from('holds')
    .select('*')
    .eq('hold_token', params.holdToken)
    .limit(1)
    .maybeSingle();
  if (holdErr) throw holdErr;
  if (!hold) {
    const e = new Error('hold_expired') as Error & { code?: string };
    e.code = 'hold_expired';
    throw e;
  }
  if (new Date(hold.expires_at) <= new Date()) {
    const e = new Error('hold_expired') as Error & { code?: string };
    e.code = 'hold_expired';
    throw e;
  }

  const phoneHash = hashPhone(params.phone);
  // Insert reservation
  const { data, error } = await sb
    .from('reservations')
    .insert({
      room_id: hold.room_id,
      period: hold.period,
      status: 'confirmed',
      reserver_name: params.name,
      phone_hash: phoneHash,
      password_hash: 'to_be_set', // will update after hashing
    })
    .select('id, room_id')
    .single();
  if (error) {
    if (String(error.message).includes('overlap')) {
      const e = new Error('conflict') as Error & { code?: string };
      e.code = 'conflict';
      throw e;
    }
    throw error;
  }

  // Hash password and update (simulate transactional behavior)
  const password_hash = await (await import('./auth')).hashPassword(params.password);
  const { error: updErr } = await sb
    .from('reservations')
    .update({ password_hash })
    .eq('id', data.id);
  if (updErr) throw updErr;

  // Optionally delete hold
  await sb.from('holds').delete().eq('id', hold.id);

  // Compose result
  const { data: room } = await sb.from('rooms').select('id,name,location').eq('id', data.room_id).single();
  const [startStr, endStr] = String(hold.period)
    .replace(/[\[\)\s]/g, '')
    .split(',');
  return {
    id: data.id,
    room: { id: room?.id ?? data.room_id, name: room?.name ?? '', location: room?.location ?? '' },
    period: { start: startStr, end: endStr },
  };
}

export async function authAndList(params: MyListParams): Promise<MyListResult> {
  const phoneHash = hashPhone(params.phone);
  const sb = getSupabase();
  const { data: rows, error } = await sb
    .from('reservations')
    .select('id, room_id, period, status, reserver_name, password_hash, created_at')
    .eq('phone_hash', phoneHash)
    .in('status', ['confirmed', 'ongoing', 'cancelled']);
  if (error) throw error;
  type ReservationRow = {
    id: number;
    room_id: number;
    period: string;
    status: 'confirmed' | 'ongoing' | 'cancelled';
    reserver_name: string;
    password_hash: string;
    created_at: string;
  };
  const typedRows = (rows ?? []) as ReservationRow[];
  const anyRow = typedRows[0];
  if (!anyRow) {
    const e = new Error('auth_failed') as Error & { code?: string };
    e.code = 'auth_failed';
    throw e;
  }
  const ok = await verifyPassword(params.password, anyRow.password_hash);
  if (!ok) {
    const e = new Error('auth_failed') as Error & { code?: string };
    e.code = 'auth_failed';
    throw e;
  }
  const { data: rooms } = await sb.from('rooms').select('id,name,location');
  const roomMap = new Map<number, { id: number; name: string; location: string }>();
  (rooms ?? []).forEach((r: { id: number; name: string; location: string }) =>
    roomMap.set(r.id, { id: r.id, name: r.name, location: r.location })
  );
  const reservations = typedRows.map((r) => {
    const [startStr, endStr] = String(r.period).replace(/[\[\)\s]/g, '').split(',');
    return {
      id: r.id,
      room: roomMap.get(r.room_id) ?? { id: r.room_id, name: '', location: '' },
      status: r.status,
      period: { start: startStr, end: endStr },
      createdAt: r.created_at,
    };
  });
  return { reservations };
}

export async function cancelReservation(params: MyCancelParams): Promise<void> {
  const phoneHash = hashPhone(params.phone);
  const sb = getSupabase();
  const { data: row, error } = await sb
    .from('reservations')
    .select('id, period, status, phone_hash, password_hash')
    .eq('id', params.reservationId)
    .single();
  if (error || !row) {
    const e = new Error('auth_failed') as Error & { code?: string };
    e.code = 'auth_failed';
    throw e;
  }
  if (row.phone_hash !== phoneHash) {
    const e = new Error('auth_failed') as Error & { code?: string };
    e.code = 'auth_failed';
    throw e;
  }
  const ok = await verifyPassword(params.password, row.password_hash);
  if (!ok) {
    const e = new Error('auth_failed') as Error & { code?: string };
    e.code = 'auth_failed';
    throw e;
  }
  const [startStr] = String(row.period).replace(/[\[\)\s]/g, '').split(',');
  if (new Date(startStr) <= new Date()) {
    const e = new Error('policy_violation') as Error & { code?: string };
    e.code = 'policy_violation';
    throw e;
  }
  const { error: updErr } = await sb
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', params.reservationId)
    .neq('status', 'cancelled');
  if (updErr) throw updErr;
}


