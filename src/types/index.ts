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
  name: string;
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

/** What the add-attendee form submits */
export interface CreatePassInput {
  name: string;
  category: PassCategory;
  email?: string;
  phone?: string;
}

/** Attendee list row — token is deliberately omitted */
export type PassListItem = Omit<Pass, 'token'>;

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
