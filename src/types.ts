export type ID = string;

export type JobStatus = 'estimate' | 'approved' | 'in-progress' | 'ready' | 'completed';
export type ApptStatus = 'scheduled' | 'done' | 'no-show';
export type TabId = 'dashboard' | 'jobs' | 'customers' | 'inventory' | 'schedule' | 'settings';
export type Tone = 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'orange';

export interface ShopSettings {
  shopName: string;
  currency: string;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface Vehicle {
  id: ID;
  customerId: ID;
  year: number;
  make: string;
  model: string;
  vin: string;
  plate: string;
  mileage: number;
}

export interface CatalogItem {
  id: ID;
  kind: 'labor' | 'part';
  name: string;
  price: number;
  sku?: string;
  stock?: number;
  reorderAt?: number;
}

export interface LineItem {
  id: ID;
  itemId?: ID;
  kind: 'labor' | 'part';
  description: string;
  qty: number;
  unitPrice: number;
}

export interface Job {
  id: ID;
  number: number;
  customerId: ID;
  vehicleId: ID;
  status: JobStatus;
  technician: string;
  promisedAt: string;
  mileageIn: number;
  notes: string;
  paid: boolean;
  createdAt: string;
  items: LineItem[];
}

export interface Appointment {
  id: ID;
  customerId: ID;
  vehicleId: ID;
  service: string;
  date: string;
  time: string;
  durationMin: number;
  status: ApptStatus;
  notes: string;
}

export interface AppState {
  customers: Customer[];
  vehicles: Vehicle[];
  items: CatalogItem[];
  jobs: Job[];
  appointments: Appointment[];
  settings: ShopSettings;
  nextJobNumber: number;
  taxRate: number;
}
