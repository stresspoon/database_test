import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as data from '../../src/data/supabaseClient.js'
import { BookingService, DomainError } from '../../src/domain/BookingService.js'

// Mocks
vi.mock('../../src/data/supabaseClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/supabaseClient.js')>('../../src/data/supabaseClient.js')
  return {
    ...actual,
    repo: {
      listActiveRooms: vi.fn(),
      listReservationsForRoom: vi.fn(),
      listBlackouts: vi.fn(),
      listActiveHolds: vi.fn(),
      insertHold: vi.fn(),
      getHoldByToken: vi.fn(),
      deleteHold: vi.fn(),
      insertReservation: vi.fn(),
      listReservationsByAuth: vi.fn(),
      cancelReservationIfAllowed: vi.fn(),
    },
    getSupabaseClient: vi.fn(() => ({ from: vi.fn() } as any)),
  }
})

const now = new Date('2030-01-01T09:00:00.000Z')

describe('BookingService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.clearAllMocks()
  })

  it('listAvailableRooms: invalid input when end <= start', async () => {
    await expect(
      BookingService.listAvailableRooms({ start: '2030-01-01T10:00:00.000Z', end: '2030-01-01T09:00:00.000Z' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('listAvailableRooms: filters out overlapping rooms', async () => {
    const repo = (data as any).repo
    repo.listActiveRooms.mockResolvedValue([
      { id: 1, name: 'A', location: 'HQ', capacity: 4, is_active: true, open_time: '09:00:00', close_time: '18:00:00' },
      { id: 2, name: 'B', location: 'HQ', capacity: 4, is_active: true, open_time: '09:00:00', close_time: '18:00:00' },
    ])
    repo.listReservationsForRoom.mockImplementation(async (roomId: number) => {
      if (roomId === 1) return [{ period: { lower: '2030-01-01T12:00:00.000Z', upper: '2030-01-01T13:00:00.000Z' } }]
      return []
    })
    const res = await BookingService.listAvailableRooms({ start: '2030-01-01T11:30:00.000Z', end: '2030-01-01T15:00:00.000Z' })
    expect(res.rooms.map((r: any) => r.id)).toEqual([2])
  })

  it('generateSlots: respects business hours and conflicts', async () => {
    const repo = (data as any).repo
    repo.listActiveRooms.mockResolvedValue([
      { id: 1, name: 'A', location: 'HQ', capacity: 4, is_active: true, open_time: '09:00:00', close_time: '10:00:00' },
    ])
    repo.listReservationsForRoom.mockResolvedValue([
      { period: { lower: '2030-01-01T09:00:00.000Z', upper: '2030-01-01T09:15:00.000Z' } },
    ])
    repo.listActiveHolds.mockResolvedValue([
      { period: { lower: '2030-01-01T09:15:00.000Z', upper: '2030-01-01T09:30:00.000Z' } },
      { period: { lower: '2030-01-01T09:30:00.000Z', upper: '2030-01-01T09:45:00.000Z' } },
    ])
    repo.listBlackouts.mockResolvedValue([
      { period: { lower: '2030-01-01T09:45:00.000Z', upper: '2030-01-01T10:00:00.000Z' } },
    ])
    const res = await BookingService.generateSlots({
      roomId: 1,
      start: '2030-01-01T09:00:00.000Z',
      end: '2030-01-01T10:00:00.000Z',
      stepMinutes: 15,
      durationMinutes: 15,
    })
    // All 15-min slots between 9:00-10:00 are blocked by conflict sequences; expect none.
    expect(res.slots).toEqual([])
  })

  it('createHold: returns token and expiry, conflicts when overlap', async () => {
    const repo = (data as any).repo
    repo.listReservationsForRoom.mockResolvedValue([])
    repo.listActiveHolds.mockResolvedValue([])
    repo.insertHold.mockImplementation(async (_row: any) => ({ id: 1 }))
    const out = await BookingService.createHold({ roomId: 1, start: '2030-01-01T11:00:00.000Z', end: '2030-01-01T12:00:00.000Z' })
    expect(out.holdToken).toBeTruthy()
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(now.getTime())

    repo.insertHold.mockRejectedValue({ code: '23505', message: 'conflict' })
    await expect(
      BookingService.createHold({ roomId: 1, start: '2030-01-01T11:00:00.000Z', end: '2030-01-01T12:00:00.000Z' })
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('confirmReservation: expired hold -> 410', async () => {
    const repo = (data as any).repo
    repo.getHoldByToken.mockResolvedValue({ id: 99, room_id: 1, period: { lower: '2030-01-01T12:00:00.000Z', upper: '2030-01-01T13:00:00.000Z' }, expires_at: '2020-01-01T00:00:00.000Z' })
    await expect(
      BookingService.confirmReservation({ holdToken: 'abc', reserverName: 'N', phone: '010', password: 'password1' })
    ).rejects.toMatchObject({ code: 'hold_expired' })
  })

  it('listReservationsByAuth: fails with wrong password', async () => {
    const getSb = (data as any).getSupabaseClient as any
    getSb.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ in: () => ({ data: [], error: null }) }) })
      })
    })
    await expect(
      BookingService.listReservationsByAuth({ phone: '010', password: 'wrongpass' })
    ).rejects.toMatchObject({ code: 'auth_failed' })
  })

  it('cancelReservation: prevents cancelling after start', async () => {
    const getSb = (data as any).getSupabaseClient as any
    // Use argon2 hash format which the service will skip the password check
    getSb.mockReturnValue({
      from: () => ({
        select: () => ({ 
          eq: () => ({ 
            eq: () => ({ 
              single: () => ({ 
                data: { 
                  id: 1,
                  period: { lower: '2029-12-31T09:00:00.000Z', upper: '2029-12-31T10:00:00.000Z' }, 
                  password_hash: '$argon2id$v=19$m=65536,t=3,p=4$fakesalt$fakehash',
                  phone_hash: 'fakehash',
                  status: 'confirmed'
                }, 
                error: null 
              }) 
            }) 
          }) 
        }),
        update: () => ({ eq: () => ({ eq: () => ({ error: null }) }) })
      })
    })
    
    // Mock argon2 to make password verification pass
    vi.doMock('argon2', () => ({
      verify: vi.fn().mockResolvedValue(true),
      hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$fakesalt$fakehash')
    }))
    
    await expect(
      BookingService.cancelReservation({ id: 1, phone: '010', password: 'password1' })
    ).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('cannot cancel after start') })
  })
})
