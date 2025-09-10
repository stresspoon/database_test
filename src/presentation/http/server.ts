import express from 'express'
import { z } from 'zod'
import { BookingService, DomainError } from '../../domain/BookingService.js'

const app = express()
app.use(express.json())

// Helpers
function sendError(res: any, err: any) {
  if (err instanceof DomainError) {
    const status = err.http ?? (
      err.code === 'invalid_input' ? 400 :
      err.code === 'auth_failed' ? 401 :
      err.code === 'conflict' ? 409 :
      err.code === 'hold_expired' ? 410 :
      err.code === 'policy_violation' ? 409 : 500
    )
    return res.status(status).json({ error: err.code, message: err.message })
  }
  console.error(err)
  return res.status(500).json({ error: 'system_error', message: 'unexpected error' })
}

// Schemas
const availabilitySchema = z.object({
  start: z.string().regex(/\d{4}-\d{2}-\d{2}T/),
  end: z.string().regex(/\d{4}-\d{2}-\d{2}T/),
  capacity: z.coerce.number().int().positive().optional(),
  location: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
})

const slotsSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  start: z.string(),
  end: z.string(),
  stepMinutes: z.coerce.number().int().positive(),
  durationMinutes: z.coerce.number().int().positive(),
  bufferMinutes: z.coerce.number().int().nonnegative().optional(),
})

const createHoldSchema = z.object({
  roomId: z.number().int().positive(),
  start: z.string(),
  end: z.string(),
  phone: z.string().optional(),
  ttlSeconds: z.number().int().positive().optional(),
})

const confirmSchema = z.object({
  holdToken: z.string().min(10),
  reserverName: z.string().min(1),
  phone: z.string().min(3),
  password: z.string().min(8),
})

const authSchema = z.object({
  phone: z.string().min(3),
  password: z.string().min(8),
})

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Room Reservation API',
    version: '1.0.0',
    endpoints: [
      'GET /rooms/availability',
      'GET /rooms/:id/slots',
      'POST /holds',
      'POST /reservations/confirm',
      'GET /reservations',
      'POST /reservations/:id/cancel'
    ]
  })
})

// Routes
app.get('/rooms/availability', async (req, res) => {
  try {
    const q = availabilitySchema.parse(req.query)
    const result = await BookingService.listAvailableRooms(q)
    res.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_input', message: e.errors.map(er => er.message).join(', ') })
    return sendError(res, e)
  }
})

app.get('/rooms/:id/slots', async (req, res) => {
  try {
    const q = slotsSchema.parse({ ...req.query, roomId: req.params.id })
    const result = await BookingService.generateSlots(q)
    res.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_input', message: e.errors.map(er => er.message).join(', ') })
    return sendError(res, e)
  }
})

app.post('/holds', async (req, res) => {
  try {
    const body = createHoldSchema.parse(req.body)
    const result = await BookingService.createHold(body)
    res.status(201).json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_input', message: e.errors.map(er => er.message).join(', ') })
    return sendError(res, e)
  }
})

app.post('/reservations/confirm', async (req, res) => {
  try {
    const body = confirmSchema.parse(req.body)
    const result = await BookingService.confirmReservation(body)
    res.status(201).json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_input', message: e.errors.map(er => er.message).join(', ') })
    return sendError(res, e)
  }
})

app.get('/reservations', async (req, res) => {
  try {
    const q = authSchema.parse(req.query)
    const result = await BookingService.listReservationsByAuth(q)
    res.json({ reservations: result })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_input', message: e.errors.map(er => er.message).join(', ') })
    return sendError(res, e)
  }
})

app.post('/reservations/:id/cancel', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_input', message: 'invalid id' })
    const body = authSchema.parse(req.body)
    const result = await BookingService.cancelReservation({ id, ...body })
    res.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_input', message: e.errors.map(er => er.message).join(', ') })
    return sendError(res, e)
  }
})

// Boot if run directly (not in Vercel)
if (process.env.NODE_ENV !== 'production' && import.meta.url === (process.argv[1] && new URL('file://' + process.argv[1]).href)) {
  const port = Number(process.env.PORT || 3000)
  app.listen(port, () => console.log(`HTTP server listening on :${port}`))
}

export default app

