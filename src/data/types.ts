// Database row types matching Supabase schema
export interface RoomRow {
  id: number
  name: string
  location: string
  capacity: number
  is_active: boolean
  open_time: string // TIME format like '09:00:00'
  close_time: string // TIME format like '18:00:00'
  created_at: string
  updated_at: string
}

export interface HoldRow {
  id: number
  room_id: number
  period: {
    lower: string
    upper: string
  }
  phone_hash: string | null
  hold_token: string
  expires_at: string
  created_at: string
}

export interface ReservationRow {
  id: number
  room_id: number
  period: {
    lower: string
    upper: string
  }
  status: 'confirmed' | 'ongoing' | 'cancelled'
  reserver_name: string
  phone_hash: string
  password_hash: string
  created_at: string
  updated_at: string
}

export interface BlackoutRow {
  id: number
  room_id: number
  period: {
    lower: string
    upper: string
  }
  reason: string | null
  created_at: string
}

// Data client interface
export interface DataClient {
  listActiveRooms(params?: { capacity?: number; location?: string }): Promise<any[]>
  getRoomById(id: number): Promise<any>
  listRoomBlackouts(roomId: number, start: Date, end: Date): Promise<any[]>
  listExpiredHolds(now: Date): Promise<any[]>
  deleteHolds(ids: number[]): Promise<number>
  listConflictingHolds(roomId: number, start: Date, end: Date): Promise<any[]>
  createHold(hold: Omit<HoldRow, 'id'|'created_at'>): Promise<any>
  getHoldByToken(token: string): Promise<any | null>
  deleteHold(id: number): Promise<boolean>
  listConfirmedReservations(roomId: number, start: Date, end: Date): Promise<any[]>
  createReservation(res: Omit<ReservationRow, 'id'|'created_at'|'updated_at'>): Promise<any>
  listReservationsByPhoneHash(phoneHash: string): Promise<any[]>
  getReservationById(id: number): Promise<any | null>
  updateReservationStatus(id: number, status: 'confirmed'|'ongoing'|'cancelled'): Promise<any | null>
  beginTransaction(): Promise<{ rollback: () => Promise<void>; commit: () => Promise<void> }>
}