export type IsoString = string; // ISO 8601 string

export type AvailabilitySearchParams = {
  date: string; // YYYY-MM-DD (server TZ)
  start: string; // HH:MM
  end: string; // HH:MM
  people: number;
  location?: string;
};

export type AvailabilityResultRoom = {
  id: number;
  name: string;
  location: string;
  capacity: number;
};

export type AvailabilityResult = {
  rooms: AvailabilityResultRoom[];
  asOf: IsoString;
};

export type SlotRule = {
  unit: number; // minutes
  buffer: number; // minutes (applied before/after)
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
};

export type Slot = {
  start: IsoString;
  end: IsoString;
  available: boolean;
  reason?: 'outside_hours' | 'blackout' | 'conflict' | 'buffer_blocked';
};

export type RoomBlocks = {
  room: {
    id: number;
    name: string;
    location: string;
    capacity: number;
    open_time: string; // HH:MM
    close_time: string; // HH:MM
  };
  reservations: { id: number; period: string; status: 'confirmed' | 'ongoing' | 'cancelled' }[];
  holds: { id: number; period: string; expires_at: IsoString }[];
  blackouts: { id: number; period: string }[];
};

export type HoldCreateParams = {
  roomId: number;
  start: IsoString;
  end: IsoString;
  phone?: string; // optional, for policy/security control
};

export type HoldCreateResult = {
  token: string;
  expiresAt: IsoString;
};

export type ReservationConfirmParams = {
  holdToken: string;
  name: string;
  phone: string;
  password: string;
};

export type ReservationConfirmResult = {
  id: number;
  room: { id: number; name: string; location: string };
  period: { start: IsoString; end: IsoString };
};

export type MyListParams = { phone: string; password: string };
export type MyCancelParams = { phone: string; password: string; reservationId: number };

export type MyReservation = {
  id: number;
  room: { id: number; name: string; location: string };
  status: 'confirmed' | 'ongoing' | 'cancelled';
  period: { start: IsoString; end: IsoString };
  createdAt: IsoString;
};

export type MyListResult = { reservations: MyReservation[] };

export type ApiErrorCode =
  | 'invalid_input'
  | 'system_error'
  | 'conflict'
  | 'hold_expired'
  | 'auth_failed'
  | 'policy_violation';

export type TsRange = { start: Date; end: Date }; // [start, end)


