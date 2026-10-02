export type PassCategory =
  | 'couple'
  | 'stag_male'
  | 'stag_female'
  | 'group'
  | 'vip'
  | 'volunteer'
  | 'complimentary';

export type PassStatus = 'unused' | 'used' | 'cancelled';

export type TicketType = 'single' | 'seasonal';

export type ValidityState = 'active' | 'paused' | 'cancelled' | 'completed';

export type DeliveryStatus =
  | 'not_sent'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'ready_to_share'
  | 'manually_shared'
  | 'queued'
  | 'read';

export type ScanMethod = 'qr' | 'manual';

export type UserRole = 'admin' | 'scanner' | 'ticketer' | 'organiser';

export interface Pass {
  id: string;
  token: string;
  manual_code: string;
  batch_id: string | null;
  name: string | null;
  category: PassCategory;
  email: string | null;
  phone: string | null;
  status: PassStatus;
  created_at: string;
  used_at: string | null;
  created_by: string;
  delivery_status: DeliveryStatus;
  delivered_at: string | null;
  // Multi-person & seasonal fields (migration 004)
  ticket_type?: TicketType;
  party_size?: number;
  valid_night_id?: string | null;
  seasonal_start_night_id?: string | null;
  seasonal_nights_count?: number | null;
  validity_state?: ValidityState;
  idempotency_key?: string | null;
  issued_by?: string | null;
  // Scan detail fields
  scanned_by?: string | null;
  scan_method?: ScanMethod | null;
}

/** Physical Ticket Batch */
export interface TicketBatch {
  id: string;
  idempotency_key: string;
  batch_number: number;
  name: string;
  category: PassCategory;
  total_count: number;
  created_at: string;
  created_by: string;
}

/** Event Night Schedule */
export interface EventNight {
  id: string;
  night_number: number;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

/** Seasonal Pass Eligible Night */
export interface PassEligibleNight {
  pass_id: string;
  event_night_id: string;
}

/** Successful Admission Record */
export interface Admission {
  id: string;
  client_request_id: string;
  pass_id: string;
  event_night_id: string;
  people_count: number;
  scan_method: ScanMethod;
  scanned_by: string;
  admitted_at: string;
}

/** Rejected Admission Attempt */
export interface AdmissionAttempt {
  id: string;
  client_request_id: string | null;
  pass_id: string | null;
  event_night_id: string | null;
  rejection_reason: string;
  requested_count: number | null;
  remaining_count: number | null;
  scan_method: ScanMethod;
  scanned_by: string | null;
  attempted_at: string;
}

/** Supervisor Admission Correction */
export interface AdmissionCorrection {
  id: string;
  admission_id: string;
  pass_id: string;
  event_night_id: string;
  correction_type: 'reverse' | 'adjust_count';
  people_delta: number;
  reason: string;
  corrected_by: string;
  corrected_at: string;
}

/** Ticket Delivery Track */
export interface TicketDelivery {
  id: string;
  pass_id: string;
  idempotency_key: string;
  channel: 'whatsapp_manual' | 'whatsapp_api';
  destination_phone: string | null;
  provider: string | null;
  provider_message_id: string | null;
  delivery_status: 'ready_to_share' | 'manually_shared' | 'queued' | 'sent' | 'delivered' | 'failed' | 'read';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  created_by: string | null;
}

/** What the add-attendee form submits */
export interface CreatePassInput {
  name?: string;
  category: PassCategory;
  email?: string;
  phone?: string;
  ticket_type?: TicketType;
  party_size?: number;
  valid_night_id?: string;
  seasonal_start_night_id?: string;
  seasonal_nights_count?: number;
  idempotency_key?: string;
}

/** Attendee list row — token is deliberately omitted, manual_code can be shown */
export type PassListItem = Omit<Pass, 'token'>;

/** Entry list row — token always omitted, manual_code may be masked */
export interface EntryListItem {
  id: string;
  name: string | null;
  category: PassCategory;
  ticket_type?: TicketType;
  party_size?: number;
  batch_id: string | null;
  batch_number: number | null;
  manual_code: string;           // masked for scanner role
  status: PassStatus;
  validity_state?: ValidityState;
  valid_night_id?: string | null;
  created_at: string;
  used_at: string | null;
  scanned_by: string | null;
  scan_method: ScanMethod | null;
  total_admitted?: number;
  night_admitted?: number;
}

/** Cursor for keyset pagination */
export interface PaginationCursor {
  timestamp: string;
  id: string;
}

export type RedemptionStatus =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID'
  | 'CANCELLED'
  | 'UNAUTHORIZED'
  | 'ERROR';

export interface RedemptionResult {
  status: RedemptionStatus;
  message?: string;
  used_at?: string;
  method?: 'qr' | 'manual';
  pass?: {
    id: string;
    manual_code?: string;
    name: string;
    category: PassCategory;
    ticket_type?: TicketType;
    party_size?: number;
  };
}

export type AdmissionDecisionStatus =
  | 'ADMIT_N'
  | 'TOO_MANY'
  | 'NIGHT_FULL'
  | 'TICKET_COMPLETE'
  | 'OUTSIDE_EVENT_WINDOW'
  | 'NIGHT_NOT_INCLUDED'
  | 'WRONG_DAY'
  | 'NOT_ACTIVATED'
  | 'CANCELLED'
  | 'INVALID'
  | 'UNAUTHORIZED'
  | 'ERROR';

export interface TicketPreviewResult {
  status:
    | 'VALID'
    | 'CANCELLED'
    | 'OUTSIDE_EVENT_WINDOW'
    | 'NIGHT_NOT_INCLUDED'
    | 'WRONG_DAY'
    | 'TICKET_COMPLETE'
    | 'NIGHT_FULL'
    | 'INVALID'
    | 'UNAUTHORIZED'
    | 'ERROR';
  pass_id?: string;
  name?: string;
  category?: PassCategory;
  ticket_type?: TicketType;
  party_size?: number;
  admitted_count?: number;
  remaining_count?: number;
  event_night_id?: string;
  event_night_title?: string;
  intended_night?: string;
  intended_date?: string;
  current_night?: string;
  message?: string;
}

export interface AdmitPassResult {
  status: AdmissionDecisionStatus;
  admission_id?: string;
  idempotent_replay?: boolean;
  admitted_now?: number;
  remaining_tonight?: number;
  event_night?: string;
  ticket_type?: TicketType;
  name?: string;
  category?: PassCategory;
  requested_count?: number;
  remaining_count?: number;
  intended_night?: string;
  intended_date?: string;
  current_night?: string;
  message?: string;
  admitted_at?: string;
}

export const CATEGORY_LABELS: Record<PassCategory, string> = {
  couple: 'Couple',
  stag_male: 'Stag (Male)',
  stag_female: 'Stag (Female)',
  group: 'Group',
  vip: 'VIP',
  volunteer: 'Volunteer',
  complimentary: 'Complimentary',
};

export const STATUS_LABELS: Record<PassStatus, string> = {
  unused: 'Unused',
  used: 'Used',
  cancelled: 'Cancelled',
};

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  not_sent: 'Not Sent',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  ready_to_share: 'Ready to share',
  manually_shared: 'Manually shared',
  queued: 'Queued',
  read: 'Read',
};
