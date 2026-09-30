export type PassCategory =
  | 'couple'
  | 'stag_male'
  | 'stag_female'
  | 'group'
  | 'vip'
  | 'volunteer'
  | 'complimentary';

export type PassStatus = 'unused' | 'used' | 'cancelled';

export type DeliveryStatus = 'not_sent' | 'sent' | 'delivered' | 'failed';

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

/** What the add-attendee form submits */
export interface CreatePassInput {
  name?: string;
  category: PassCategory;
  email?: string;
  phone?: string;
}

/** Attendee list row — token is deliberately omitted, manual_code can be shown */
export type PassListItem = Omit<Pass, 'token'>;

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
  };
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
};
