import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { ReservationRow } from './types.js'

export type TimeRange = { start: Date; end: Date }

export type Room = {
  id: number
  name: string
  location: string
  capacity: number
  is_active: boolean
  open_time: string // 'HH:MM:SS'
  close_time: string
}

export type Blackout = {
  id: number
  room_id: number
  period: { lower: string; upper: string; lower_inc: boolean; upper_inc: boolean }
}

export type Hold = {
  id: number
  room_id: number
  period: { lower: string; upper: string; lower_inc: boolean; upper_inc: boolean }
  hold_token: string
  expires_at: string
}

export type Reservation = {
  id: number
  room_id: number
  period: { lower: string; upper: string; lower_inc: boolean; upper_inc: boolean }
  status: 'confirmed' | 'ongoing' | 'cancelled'
  reserver_name: string
  phone_hash: string
  password_hash: string
}

export class DataAccessError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'DataAccessError'
    this.code = code
  }
}

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  }
  client = createClient(url, key)
  return client
}

// Thin repository-like helpers wrapping postgrest filters. These are intentionally minimal.
export const repo = {
  async listActiveRooms(params: {
    capacity?: number
    location?: string
  }): Promise<Room[]> {
    const sb = getSupabaseClient()
    let q = sb.from('rooms').select('*').eq('is_active', true)
    if (params.capacity) q = q.gte('capacity', params.capacity)
    if (params.location) q = q.eq('location', params.location)
    const { data, error } = await q
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Room[]
  },

  async listReservationsForRoom(roomId: number, range: TimeRange, statuses: ('confirmed' | 'ongoing' | 'cancelled')[] = ['confirmed', 'ongoing']): Promise<Reservation[]> {
    const sb = getSupabaseClient()
    // PostgREST range overlap: period && tsrange(start,end,'[)')
    const { data, error } = await sb
      .from('reservations')
      .select('*')
      .eq('room_id', roomId)
      .in('status', statuses)
      .filter('period', 'ov', `tsrange('${range.start.toISOString()}', '${range.end.toISOString()}', '[)')`)
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Reservation[]
  },

  async listBlackouts(roomId: number, range: TimeRange): Promise<Blackout[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('room_blackouts')
      .select('*')
      .eq('room_id', roomId)
      .filter('period', 'ov', `tsrange('${range.start.toISOString()}', '${range.end.toISOString()}', '[)')`)
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Blackout[]
  },

  async listActiveHolds(roomId: number, range: TimeRange, now: Date): Promise<Hold[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('holds')
      .select('*')
      .eq('room_id', roomId)
      .gt('expires_at', now.toISOString())
      .filter('period', 'ov', `tsrange('${range.start.toISOString()}', '${range.end.toISOString()}', '[)')`)
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Hold[]
  },

  async listHoldsForRoom(roomId: number, range: TimeRange): Promise<Hold[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('holds')
      .select('*')
      .eq('room_id', roomId)
      .gt('expires_at', new Date().toISOString())
      .filter('period', 'ov', `tsrange('${range.start.toISOString()}', '${range.end.toISOString()}', '[)')`)
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Hold[]
  },

  async insertHold(row: { room_id: number; start: Date; end: Date; phone_hash: string | null; hold_token: string; expires_at: Date }): Promise<Hold> {
    const sb = getSupabaseClient()
    const period = `tsrange('${row.start.toISOString()}','${row.end.toISOString()}','[)')`
    const { data, error } = await sb
      .from('holds')
      .insert({
        room_id: row.room_id,
        period,
        phone_hash: row.phone_hash ?? null,
        hold_token: row.hold_token,
        expires_at: row.expires_at.toISOString(),
      })
      .select('*')
      .single()
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Hold
  },

  async getHoldByToken(token: string): Promise<Hold | null> {
    const sb = getSupabaseClient()
    const { data, error } = await sb.from('holds').select('*').eq('hold_token', token).single()
    if (error) {
      if ((error as any).details?.includes('0 rows')) return null
      throw new DataAccessError(error.message, error.code)
    }
    return data as unknown as Hold
  },

  async deleteHold(id: number): Promise<void> {
    const sb = getSupabaseClient()
    const { error } = await sb.from('holds').delete().eq('id', id)
    if (error) throw new DataAccessError(error.message, error.code)
  },

  async insertReservation(row: Omit<ReservationRow, 'id' | 'created_at' | 'updated_at'>): Promise<Reservation> {
    const sb = getSupabaseClient()
    const period = typeof row.period === 'object' 
      ? `tsrange('${row.period.lower}','${row.period.upper}','[)')`
      : row.period
    const { data, error } = await sb
      .from('reservations')
      .insert({
        room_id: row.room_id,
        period,
        reserver_name: row.reserver_name,
        phone_hash: row.phone_hash,
        password_hash: row.password_hash,
        status: row.status || 'confirmed',
      })
      .select('*')
      .single()
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Reservation
  },

  async listReservationsByPhoneHash(phone_hash: string): Promise<Reservation[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('reservations')
      .select('*')
      .eq('phone_hash', phone_hash)
      .in('status', ['confirmed', 'ongoing'])
      .order('created_at', { ascending: false })
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Reservation[]
  },

  async listReservationsByAuth(auth: { phone_hash: string; password_hash: string }): Promise<Reservation[]> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('reservations')
      .select('*')
      .eq('phone_hash', auth.phone_hash)
      .eq('password_hash', auth.password_hash)
      .in('status', ['confirmed', 'ongoing'])
      .order('created_at', { ascending: false })
    if (error) throw new DataAccessError(error.message, error.code)
    return data as unknown as Reservation[]
  },

  async cancelReservationIfAllowed(input: { id: number; phone_hash: string; password_hash: string; now: Date }): Promise<boolean> {
    const sb = getSupabaseClient()
    // Ensure reservation belongs to auth and has not started yet
    const { data, error } = await sb
      .from('reservations')
      .select('*')
      .eq('id', input.id)
      .eq('phone_hash', input.phone_hash)
      .eq('password_hash', input.password_hash)
      .single()
    if (error) throw new DataAccessError(error.message, error.code)
    if (!data) return false
    const startIso = (data as any).period.lower as string
    if (new Date(startIso) <= input.now) return false
    const { error: updErr } = await sb
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', input.id)
      .eq('status', 'confirmed')
    if (updErr) throw new DataAccessError(updErr.message, updErr.code)
    return true
  },
}

