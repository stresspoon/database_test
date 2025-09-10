import { RoomRow, HoldRow, ReservationRow, BlackoutRow, DataClient } from './types.js'
import type { Room, Hold, Reservation, Blackout } from './supabaseClient.js'

// Mock data
const mockRooms: RoomRow[] = [
  { id: 1, name: '회의실 A', location: '3층', capacity: 6, is_active: true, open_time: '09:00:00', close_time: '18:00:00', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 2, name: '회의실 B', location: '3층', capacity: 10, is_active: true, open_time: '09:00:00', close_time: '20:00:00', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 3, name: '회의실 C', location: '4층', capacity: 4, is_active: true, open_time: '08:00:00', close_time: '22:00:00', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 4, name: '대회의실', location: '5층', capacity: 20, is_active: true, open_time: '09:00:00', close_time: '18:00:00', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

const mockHolds: HoldRow[] = []
const mockReservations: ReservationRow[] = []
const mockBlackouts: BlackoutRow[] = []

export const MockDataClient = {
  async listActiveRooms(params: { capacity?: number; location?: string } = {}): Promise<Room[]> {
    let rooms = [...mockRooms].filter(r => r.is_active)
    if (params.capacity) {
      rooms = rooms.filter(r => r.capacity >= params.capacity)
    }
    if (params.location) {
      rooms = rooms.filter(r => r.location === params.location)
    }
    return rooms as unknown as Room[]
  },

  async getRoomById(id: number) {
    const room = mockRooms.find(r => r.id === id)
    if (!room) throw new Error('Room not found')
    return room
  },

  async listBlackouts(roomId: number, range: { start: Date; end: Date }): Promise<Blackout[]> {
    return mockBlackouts.filter(b => 
      b.room_id === roomId &&
      new Date(b.period.lower) < range.end &&
      new Date(b.period.upper) > range.start
    ) as unknown as Blackout[]
  },

  async listRoomBlackouts(roomId: number, start: Date, end: Date) {
    return mockBlackouts.filter(b => 
      b.room_id === roomId &&
      new Date(b.period.lower) < end &&
      new Date(b.period.upper) > start
    )
  },

  async listHoldsForRoom(roomId: number, range: { start: Date; end: Date }): Promise<Hold[]> {
    return mockHolds.filter(h => 
      h.room_id === roomId &&
      new Date(h.period.lower) < range.end &&
      new Date(h.period.upper) > range.start
    ) as unknown as Hold[]
  },

  async listExpiredHolds(now: Date) {
    return mockHolds.filter(h => new Date(h.expires_at) <= now)
  },

  async deleteHolds(ids: number[]) {
    const count = mockHolds.filter(h => ids.includes(h.id)).length
    ids.forEach(id => {
      const index = mockHolds.findIndex(h => h.id === id)
      if (index !== -1) mockHolds.splice(index, 1)
    })
    return count
  },

  async listConflictingHolds(roomId: number, start: Date, end: Date) {
    return mockHolds.filter(h => 
      h.room_id === roomId &&
      new Date(h.period.lower) < end &&
      new Date(h.period.upper) > start
    )
  },

  async createHold(hold: Omit<HoldRow, 'id'|'created_at'>) {
    const newHold: HoldRow = {
      ...hold,
      id: mockHolds.length + 1,
      created_at: new Date().toISOString()
    }
    mockHolds.push(newHold)
    return newHold
  },

  async getHoldByToken(token: string) {
    const hold = mockHolds.find(h => h.hold_token === token)
    if (!hold) return null
    return hold
  },

  async deleteHold(id: number) {
    const index = mockHolds.findIndex(h => h.id === id)
    if (index !== -1) {
      mockHolds.splice(index, 1)
      return true
    }
    return false
  },

  async deleteExpiredHolds(now: Date) {
    const expired = mockHolds.filter(h => new Date(h.expires_at) <= now)
    const ids = expired.map(h => h.id)
    return this.deleteHolds(ids)
  },

  async listReservationsForRoom(roomId: number, range: { start: Date; end: Date }, statuses: ('confirmed' | 'ongoing' | 'cancelled')[] = ['confirmed', 'ongoing']): Promise<Reservation[]> {
    return mockReservations.filter(r => 
      r.room_id === roomId &&
      statuses.includes(r.status) &&
      new Date(r.period.lower) < range.end &&
      new Date(r.period.upper) > range.start
    ) as unknown as Reservation[]
  },

  async listConfirmedReservations(roomId: number, start: Date, end: Date) {
    return mockReservations.filter(r => 
      r.room_id === roomId &&
      (r.status === 'confirmed' || r.status === 'ongoing') &&
      new Date(r.period.lower) < end &&
      new Date(r.period.upper) > start
    )
  },

  async createReservation(res: Omit<ReservationRow, 'id'|'created_at'|'updated_at'>) {
    const newRes: ReservationRow = {
      ...res,
      id: mockReservations.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockReservations.push(newRes)
    return newRes
  },

  async listReservationsByPhoneHash(phoneHash: string) {
    return mockReservations.filter(r => r.phone_hash === phoneHash)
  },

  async getReservationById(id: number) {
    const res = mockReservations.find(r => r.id === id)
    if (!res) return null
    return res
  },

  async updateReservationStatus(id: number, status: 'confirmed'|'ongoing'|'cancelled') {
    const res = mockReservations.find(r => r.id === id)
    if (!res) return null
    res.status = status
    res.updated_at = new Date().toISOString()
    return res
  },

  async beginTransaction() {
    return {
      rollback: async () => {},
      commit: async () => {}
    }
  }
}