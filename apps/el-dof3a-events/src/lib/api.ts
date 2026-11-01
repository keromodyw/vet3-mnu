import { supabase } from './supabase'
import type { LayoutSpec } from './layout'

export type Gender = 'male' | 'female'
export type Restriction = 'any' | Gender
export type Role = 'super_admin' | 'reviewer' | 'scanner'

export type Batch = 'first' | 'second' | 'third' | 'fourth'
export const BATCH_AR: Record<Batch, string> = { first: 'دفعة أولى', second: 'دفعة ثانية', third: 'دفعة ثالثة', fourth: 'دفعة رابعة' }
/** 2423xxxx → رابعة · 2424 → ثالثة · 2425 → ثانية · 2426 → أولى (info + stats only) */
export const batchOf = (acad: string | null | undefined): Batch | null =>
  ({ '2423': 'fourth', '2424': 'third', '2425': 'second', '2426': 'first' } as Record<string, Batch>)[String(acad ?? '').slice(0, 4)] ?? null

export interface Student { national_id: string; name: string; academic_no: string | null; gender: Gender; batch: Batch | null }

export interface EventRow {
  id: string; title: string; description: string | null; venue: string | null; poster_url: string | null
  event_at: string | null; booking_opens_at: string | null; booking_closes_at: string | null
  price: number; instapay_phone: string | null; instapay_note: string | null
  max_bookings: number | null; hold_minutes: number; published: boolean; created_at: string; numbering_dir: 'rtl' | 'ltr'
  booking_mode: 'seats' | 'names'; payment_required: boolean; auto_approve: boolean
  layout_spec?: LayoutSpec | null
  seats_total?: number; seats_free?: number; spots_left?: number | null
}

export interface Seat {
  id: string; event_id: string; row_label: string; seat_no: number; label: string; sort_order: number
  row_no: number; section: string; section_order?: number; pos: number
  restriction: Restriction; blocked: boolean; state: 'free' | 'held' | 'taken'; held_until: string | null
}

export type BookingStatus = 'awaiting_payment' | 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired'
export interface Booking {
  id: string; event_id: string; status: BookingStatus; amount: number
  hold_until: string | null; submitted_at: string | null; reviewed_at: string | null
  decline_reason: string | null; scanned_at: string | null; created_at: string
  seat_label: string | null; seat_row: string | null
  event_title: string; event_venue: string | null; event_at: string | null
  instapay_phone: string | null; instapay_note: string | null; price: number; hold_minutes: number
  payment_required: boolean; booking_mode: 'seats' | 'names'
  national_id: string; name: string; academic_no: string | null; batch: Batch | null
}

export type ScanOutcome = 'ok' | 'duplicate' | 'not_found' | 'not_approved' | 'invalid'
export interface ScanResult {
  result: ScanOutcome; national_id?: string; name?: string | null; academic_no?: string | null
  seat?: string | null; first_scanned_at?: string | null; status?: string | null
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export const isStudentSeatFree = (s: Seat, now: number) =>
  !s.blocked && (s.state === 'free' || (s.state === 'held' && !!s.held_until && new Date(s.held_until).getTime() < now))

export const genderOf = (nid: string): Gender => (Number(nid[12]) % 2 === 1 ? 'male' : 'female')
export const genderAr = (g: Gender) => (g === 'male' ? 'ذكر' : 'أنثى')

const ERR: Record<string, string> = {
  seat_taken: 'الكرسي ده اتحجز حالاً — اختار كرسي تاني',
  seat_gender: 'الكرسي ده مخصص للجنس التاني',
  seat_unavailable: 'الكرسي ده مش متاح',
  seat_not_found: 'الكرسي مش موجود',
  already_booked: 'انت حاجز كرسي بالفعل في الإيفينت ده',
  booking_not_open: 'الحجز لسه ما بدأش',
  booking_closed: 'الحجز اتقفل',
  sold_out: 'العدد المسموح بيه اكتمل',
  student_not_allowed: 'الرقم القومي ده مش مسموح له بالحجز',
  event_not_found: 'الإيفينت مش متاحة',
  hold_expired: 'انتهت مهلة الكرسي واتحجز لشخص تاني — اختار كرسي جديد',
  proof_required: 'لازم ترفع صورة إثبات الدفع',
  booking_not_found: 'الحجز مش موجود',
  not_pending: 'الطلب ده اتراجع قبل كده',
  forbidden: 'مفيش عندك صلاحية للعملية دي',
  has_bookings: 'مينفعش تغيّر التصميم لأن فيه حجوزات شغالة',
  bad_layout: 'أرقام التصميم غير صحيحة',
  bad_name: 'اكتب اسم للتصميم الأول',
  bad_keys: 'مينفعش بلوكين يكون حرف واحد فيهم هو بداية التاني ومكمّل أرقام (زي A و A1) — غيّر الحروف',
  too_many_seats: 'عدد الكراسي أكبر من المسموح — قلّل الصفوف أو البلوكات',
  wrong_mode: 'نوع الحجز في الإيفينت ده مختلف',
  bad_nid: 'الرقم القومي لازم يكون 14 رقم بالظبط',
  bad_academic: 'الرقم الأكاديمي لازم يكون 8 أرقام بالظبط',
  id_mismatch: 'الرقم القومي والرقم الأكاديمي مش تبع نفس الطالب — راجع الأرقام',
  academic_taken: 'الرقم الأكاديمي ده مسجّل لطالب تاني — راجع الرقم',
}
export function errText(e: unknown): string {
  const m = String((e as any)?.message || e || '')
  for (const k of Object.keys(ERR)) if (m.includes(k)) return ERR[k]
  if (/fetch|network|Failed/i.test(m)) return 'مفيش اتصال بالإنترنت، جرّب تاني'
  return 'حصلت مشكلة، حاول تاني'
}

// ---- the student "stays logged in" on this device ----
const KEY = 'md_student'
export const getStudent = (): Student | null => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
export const saveStudent = (s: Student) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }
export const clearStudent = () => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }

export type Phase = 'soon' | 'open' | 'closed'
/** booking window, judged on the SERVER clock (pass serverNow()); the database enforces it again on every booking */
export function eventPhase(e: Pick<EventRow, 'booking_opens_at' | 'booking_closes_at'>, now: number): Phase {
  if (e.booking_opens_at && now < new Date(e.booking_opens_at).getTime()) return 'soon'
  if (e.booking_closes_at && now >= new Date(e.booking_closes_at).getTime()) return 'closed'
  return 'open'
}

export async function fetchSeats(eventId: string): Promise<Seat[]> {
  const out: Seat[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('seats').select('*').eq('event_id', eventId).order('sort_order').range(from, from + 999)
    if (error) throw error
    out.push(...((data as Seat[]) || []))
    if (!data || data.length < 1000) break
  }
  return out
}

export interface EventStats {
  seats_total: number; seats_blocked: number; seats_taken: number; seats_held: number; seats_free: number; seats_male: number; seats_female: number
  awaiting: number; pending: number; approved: number; declined: number
  revenue_approved: number; revenue_pending: number; male_booked: number; female_booked: number; entered: number
  scan_ok: number; scan_duplicate: number; scan_declined: number; now: string
  booking_mode: 'seats' | 'names'; max_bookings: number | null
  batch_first: number; batch_second: number; batch_third: number; batch_fourth: number; batch_unknown: number
}
export interface ScanRow {
  id: string; event_id: string; national_id: string | null; student_name: string | null; seat_label: string | null
  result: 'ok' | 'duplicate' | 'not_found' | 'not_approved' | 'invalid'; scanner_name: string | null; scanned_at: string
}
export const SCAN_LABEL: Record<ScanRow['result'], string> = {
  ok: 'دخل', duplicate: 'اتعمل له سكان قبل كده', not_found: 'مفيش حجز', not_approved: 'حجز غير مؤكد', invalid: 'كود غير صالح',
}
