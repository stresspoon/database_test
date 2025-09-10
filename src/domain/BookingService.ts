import crypto from 'node:crypto'
import { nanoid } from 'nanoid'
import type { Room, Reservation, Hold, Blackout } from '../data/supabaseClient.js'
import { repo as supabaseRepo, DataAccessError } from '../data/supabaseClient.js'
import { MockDataClient } from '../data/mockClient.js'

// Use mock client if Supabase credentials not available
const repo = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY ? supabaseRepo : MockDataClient

export type ErrorCode = 'invalid_input' | 'conflict' | 'hold_expired' | 'auth_failed' | 'policy_violation' | 'system_error'

export class DomainError extends Error {
  code: ErrorCode
  http?: number
  constructor(code: ErrorCode, message: string, http?: number) {
    super(message)
    this.code = code
    this.http = http
  }
}

export type AvailabilityParams = {
  start: string // ISO
  end: string   // ISO
  capacity?: number
  location?: string
  page?: number
  pageSize?: number
}

export type SlotsParams = {
  roomId: number
  start: string // ISO window start
  end: string   // ISO window end
  stepMinutes: number
  durationMinutes: number
  bufferMinutes?: number
}

export type HoldInput = {
  roomId: number
  start: string // ISO
  end: string   // ISO
  phone?: string
  ttlSeconds?: number
}

export type ConfirmInput = {
  holdToken: string
  reserverName: string
  phone: string
  password: string
}

export type ListReservationsAuth = {
  phone: string
  password: string
}

export type CancelInput = {
  id: number
  phone: string
  password: string
}

// Utility time helpers
function parseISO(iso: string): Date {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new DomainError('invalid_input', 'Invalid ISO datetime')
  return d
}

function assertTimeWindow(start: Date, end: Date) {
  const now = new Date()
  if (!(start < end)) throw new DomainError('invalid_input', 'start must be before end', 400)
  // allow now equal? We'll exclude past entirely
  if (end <= now) throw new DomainError('invalid_input', 'time window must be in the future', 400)
}

function toIso(d: Date): string {
  return d.toISOString()
}

function ceilToStep(date: Date, stepMinutes: number): Date {
  const ms = stepMinutes * 60_000
  const t = date.getTime()
  const r = Math.ceil(t / ms) * ms
  return new Date(r)
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function hashPhone(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex')
}

async function hashPassword(password: string): Promise<string> {
  // Prefer argon2 if available; fallback to scrypt for local/dev
  try {
    const argon2 = await import('argon2')
    return await argon2.hash(password)
  } catch {
    const salt = crypto.randomBytes(16)
    const derived = await new Promise<Buffer>((resolve, reject) =>
      crypto.scrypt(password, salt, 32, (err, buf) => (err ? reject(err) : resolve(buf as Buffer)))
    )
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
  }
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$argon2') || stored.startsWith('$argon2id')) {
    try {
      const argon2 = await import('argon2')
      return await argon2.verify(stored, password)
    } catch {
      return false
    }
  }
  if (stored.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = stored.split('$')
    const salt = Buffer.from(saltHex, 'hex')
    const derived = await new Promise<Buffer>((resolve, reject) =>
      crypto.scrypt(password, salt, 32, (err, buf) => (err ? reject(err) : resolve(buf as Buffer)))
    )
    const storedHash = Buffer.from(hashHex, 'hex')
    if (derived.length !== storedHash.length) return false
    return crypto.timingSafeEqual(derived, storedHash)
  }
  return false
}

// Core service
export class BookingService {
  // list available rooms with basic filters, excluding overlap with confirmed/ongoing
  static async listAvailableRooms(params: AvailabilityParams): Promise<{ rooms: Room[]; asOf: string }> {
    const start = parseISO(params.start)
    const end = parseISO(params.end)
    assertTimeWindow(start, end)

    // basic filters via repo
    const rooms = await repo.listActiveRooms({ capacity: params.capacity, location: params.location })
    // filter out rooms with overlapping reservations
    const filtered: Room[] = []
    for (const room of rooms) {
      const conflicts = await repo.listReservationsForRoom(room.id, { start, end }, ['confirmed', 'ongoing'])
      if (conflicts.length === 0) filtered.push(room)
    }
    // TODO: pagination could be applied here; keep minimal
    return { rooms: filtered, asOf: toIso(new Date()) }
  }

  // generate candidate slots taking business hours, blackouts, reservations, holds into account
  static async generateSlots(params: SlotsParams): Promise<{ slots: { start: string; end: string }[] }> {
    const start = parseISO(params.start)
    const end = parseISO(params.end)
    assertTimeWindow(start, end)
    if (params.stepMinutes <= 0 || params.durationMinutes <= 0) throw new DomainError('invalid_input', 'step/duration must be positive', 400)
    const buffer = params.bufferMinutes ?? 0
    const window = { start, end }

    // Load room + blackouts + reservations + holds
    const rooms = await repo.listActiveRooms({})
    const room = rooms.find((r: Room) => r.id === params.roomId && r.is_active)
    if (!room) throw new DomainError('invalid_input', 'room not found or inactive', 400)

    // Compute business day bounds for each day intersecting window; keep simple: use room.open_time/close_time daily within window
    const slots: { start: Date; end: Date }[] = []
    const step = params.stepMinutes
    const dur = params.durationMinutes
    let cursor = ceilToStep(start, step)
    while (addMinutes(cursor, dur) <= end) {
      // check against business hours for that date
      const open = new Date(cursor)
      const [oh, om] = room.open_time.split(':').map(Number)
      open.setUTCHours(oh, om, 0, 0)
      const close = new Date(cursor)
      const [ch, cm] = room.close_time.split(':').map(Number)
      close.setUTCHours(ch, cm, 0, 0)

      const s = cursor
      const e = addMinutes(cursor, dur)
      const effectiveStart = addMinutes(s, 0) // clone
      const effectiveEnd = addMinutes(e, 0)

      const withinBusiness = effectiveStart >= open && effectiveEnd <= close
      if (withinBusiness) slots.push({ start: s, end: e })
      cursor = addMinutes(cursor, step)
    }

    // load conflicts
    const [reservations, holds, blackouts] = await Promise.all([
      repo.listReservationsForRoom(params.roomId, window, ['confirmed', 'ongoing']),
      repo.listHoldsForRoom(params.roomId, window),
      repo.listBlackouts(params.roomId, window),
    ])

    const conflicts = [
      ...reservations.map((r: any) => ({ start: new Date(r.period.lower), end: new Date(r.period.upper) })),
      ...holds.map((h: any) => ({ start: new Date(h.period.lower), end: new Date(h.period.upper) })),
      ...blackouts.map((b: any) => ({ start: new Date(b.period.lower), end: new Date(b.period.upper) })),
    ]

    const buffered = buffer > 0 ? (rng: { start: Date; end: Date }) => ({ start: addMinutes(rng.start, -buffer), end: addMinutes(rng.end, buffer) }) : (x: any) => x

    const available = slots.filter(({ start: s, end: e }) => !conflicts.some(c => {
      const bc = buffered(c)
      return s < bc.end && e > bc.start
    }))

    return { slots: available.map(x => ({ start: toIso(x.start), end: toIso(x.end) })) }
  }

  static async createHold(input: HoldInput): Promise<{ holdToken: string; expiresAt: string }> {
    const start = parseISO(input.start)
    const end = parseISO(input.end)
    assertTimeWindow(start, end)
    const ttl = input.ttlSeconds ?? 300
    if (ttl <= 0) throw new DomainError('invalid_input', 'ttl must be positive', 400)

    // Collision pre-check against reservations and active holds
    const [reservations, holds] = await Promise.all([
      repo.listReservationsForRoom(input.roomId, { start, end }, ['confirmed', 'ongoing']),
      repo.listHoldsForRoom(input.roomId, { start, end }),
    ])
    if (reservations.length > 0 || holds.length > 0) throw new DomainError('conflict', 'slot already held or reserved', 409)

    const holdToken = nanoid(24)
    const expiresAt = new Date(Date.now() + ttl * 1000)
    const phone_hash = input.phone ? hashPhone(input.phone) : null
    try {
      await repo.insertHold({ room_id: input.roomId, start, end, phone_hash, hold_token: holdToken, expires_at: expiresAt })
    } catch (e) {
      const da = e as DataAccessError
      if (da.code === '23505' /* unique_violation or overlap*/ ) throw new DomainError('conflict', 'hold conflict', 409)
      throw new DomainError('system_error', da.message)
    }
    return { holdToken, expiresAt: toIso(expiresAt) }
  }

  static async confirmReservation(input: ConfirmInput): Promise<{ id: number; roomId: number; start: string; end: string }> {
    // simple password policy: length >= 8
    if (!input.password || input.password.length < 8) throw new DomainError('invalid_input', 'weak password', 400)
    const hold = await repo.getHoldByToken(input.holdToken)
    if (!hold) throw new DomainError('invalid_input', 'invalid hold token', 400)
    const now = new Date()
    if (new Date(hold.expires_at) <= now) {
      // purge best-effort
      try { await repo.deleteHold(hold.id) } catch {}
      throw new DomainError('hold_expired', 'hold expired', 410)
    }
    const start = new Date(hold.period.lower)
    const end = new Date(hold.period.upper)
    const phone_hash = hashPhone(input.phone)
    const password_hash = await hashPassword(input.password)
    try {
      const r = await repo.insertReservation({ 
        room_id: hold.room_id, 
        period: { lower: start.toISOString(), upper: end.toISOString() },
        status: 'confirmed' as const,
        reserver_name: input.reserverName, 
        phone_hash, 
        password_hash 
      })
      // best-effort delete hold after success
      try { await repo.deleteHold(hold.id) } catch {}
      return { id: r.id, roomId: r.room_id, start: hold.period.lower, end: hold.period.upper }
    } catch (e) {
      const da = e as DataAccessError
      if (da.code === '23505') throw new DomainError('conflict', 'reservation overlap', 409)
      throw new DomainError('system_error', da.message)
    }
  }

  static async listReservationsByAuth(auth: ListReservationsAuth): Promise<Reservation[]> {
    const phone_hash = hashPhone(auth.phone)
    const all = await repo.listReservationsByPhoneHash(phone_hash)
    const ok: Reservation[] = []
    for (const r of all) {
      if (await verifyPassword(auth.password, (r as any).password_hash)) ok.push(r as Reservation)
    }
    if (ok.length === 0) throw new DomainError('auth_failed', 'authentication failed', 401)
    return ok
  }

  static async cancelReservation(input: CancelInput): Promise<{ cancelled: boolean }> {
    const phone_hash = hashPhone(input.phone)
    // We cannot recompute stored hash; rely on repo method to require both phone_hash and password_hash match.
    // As with list, fetch by phone then verify and perform conditional update.
    const sb = (await import('../data/supabaseClient.js')).getSupabaseClient()
    const { data, error } = await sb
      .from('reservations')
      .select('*')
      .eq('id', input.id)
      .eq('phone_hash', phone_hash)
      .single()
    if (error) throw new DomainError('system_error', error.message)
    if (!data) throw new DomainError('auth_failed', 'authentication failed', 401)
    const r = data as unknown as Reservation
    if (!(await verifyPassword(input.password, r.password_hash))) throw new DomainError('auth_failed', 'authentication failed', 401)
    const now = new Date()
    const start = new Date(r.period.lower)
    if (start <= now) throw new DomainError('conflict', 'cannot cancel after start', 409)
    try {
      const { error: updErr } = await sb
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', input.id)
        .eq('status', 'confirmed')
      if (updErr) throw updErr
    } catch (e: any) {
      throw new DomainError('conflict', 'concurrent cancel conflict', 409)
    }
    return { cancelled: true }
  }
}

