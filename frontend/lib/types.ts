export type Role = 'user' | 'recycler' | 'admin';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  profilePicUrl?: string | null;
  emailVerifiedAt?: string | null;
}

export type StoreStatus = 'pending' | 'approved' | 'rejected';
export type ServiceMode = 'dropoff' | 'pickup' | 'both';
export type PaymentPolicy = 'pays' | 'free' | 'fee';

export const CATEGORIES = [
  'laptops',
  'phones',
  'batteries',
  'appliances',
  'cables',
  'monitors',
  'other'
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

export const PICKUP_TIME_SLOTS = [
  '09:00-11:00',
  '11:00-13:00',
  '14:00-16:00',
  '16:00-18:00'
] as const;
export type PickupTimeSlot = (typeof PICKUP_TIME_SLOTS)[number];

export type PickupStatus = 'requested' | 'confirmed' | 'declined' | 'completed' | 'cancelled';
export type ItemCondition = 'working' | 'broken' | 'unknown';

export interface Store {
  id: number;
  storeName: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  status: StoreStatus;
  categories: Category[];
  description?: string | null;
  yearEstablished?: number | null;
  logoUrl?: string | null;
  licenceNumber?: string | null;
  website?: string | null;
  openDays?: Day[] | null;
  openTime?: string | null;
  closeTime?: string | null;
  serviceMode?: ServiceMode | null;
  pickupRadiusKm?: number | null;
  paymentPolicy?: PaymentPolicy | null;
  languages?: string[] | null;
  rejectReason?: string | null;
  approvedAt?: string | null;
  distance_km?: number;
  recyclerName?: string;
  recyclerPhone?: string | null;
  recycler?: { id: number; name: string; email: string; phone?: string | null };
  /** Aggregate review fields populated by GET /api/stores. */
  avgRating?: number | null;
  reviewCount?: number;
}

export interface ContactReceived {
  id: number;
  createdAt: string;
  status: string;
  recyclerConnectedAt?: string | null;
  user: { id: number; name: string; email: string; phone?: string | null };
}

export interface ContactedStore {
  id: number;
  createdAt: string;
  status?: string;
  recyclerConnectedAt?: string | null;
  store: { id: number; storeName: string; address?: string | null; logoUrl?: string | null };
}

export interface PickupItem {
  id: number;
  pickupId: number;
  category: Category;
  quantity: number;
  estimatedWeightKg?: number | null;
  condition?: ItemCondition | null;
  photoUrl?: string | null;
  notes?: string | null;
}

export interface Pickup {
  id: number;
  userId: number;
  storeId: number;
  scheduledDate: string; // YYYY-MM-DD
  timeSlot: string;
  address: string;
  notes?: string | null;
  status: PickupStatus;
  confirmedAt?: string | null;
  completedAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  items: PickupItem[];
  store?: { id: number; storeName: string; address?: string | null; logoUrl?: string | null };
  user?: { id: number; name: string; email: string; phone?: string | null };
  review?: { id: number; rating: number } | null;
}

export interface Review {
  id: number;
  pickupId: number;
  userId: number;
  storeId: number;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: { id: number; name: string };
  store?: { id: number; storeName: string };
}
