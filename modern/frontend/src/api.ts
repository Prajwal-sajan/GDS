// Typed client for the JourneyOS admin API. The admin key is kept in sessionStorage only.
export type OutboxStatus = "Pending" | "Delivering" | "Acknowledged" | "Failed" | "Blocked" | "Superseded";

export interface RedBusStatus {
  configured: boolean;
  operatorCode: string | null;
  callbackHost: string | null;
  outboundEnabled: boolean;
  lastSuccessfulSyncAt: string | null;
  outbox: { status: OutboxStatus; count: number }[];
  actions: { actionType: string; status: OutboxStatus; count: number; last: string }[];
  publishedInventories: number;
  bookings: { status: string; count: number }[];
  redisConnected: boolean;
  verification: string;
}

export interface OutboxRow {
  id: number;
  actionType: string;
  dedupKey: string;
  status: OutboxStatus;
  attempts: number;
  lastHttpStatus: number | null;
  lastError: string | null;
  createdAt: string;
  nextAttemptAt: string;
  acknowledgedAt: string | null;
  payloadJson: string;
}

export interface Attempt { id: number; at: string; httpStatus: number | null; responseBody: string | null; error: string | null; acknowledged: boolean }

export interface TripRow {
  id: number; travelDate: string; status: string; bookable: boolean; routeId: number; service: string; name: string;
  departure: string; booked: number; held: number; blocked: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const KEY = "journeyos.adminKey";
export const getKey = () => sessionStorage.getItem(KEY) ?? "";
export const setKey = (k: string) => (k ? sessionStorage.setItem(KEY, k) : sessionStorage.removeItem(KEY));

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "X-Admin-Key": getKey(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.message ?? data?.errorCode ?? `HTTP ${res.status}`);
  return data as T;
}

const rb = "/api/admin/integrations/redbus";
export const api = {
  status: () => call<RedBusStatus>("GET", `${rb}/status`),
  outbox: (status?: string) => call<OutboxRow[]>("GET", `${rb}/outbox${status ? `?status=${status}` : ""}`),
  attempts: (id: number) => call<Attempt[]>("GET", `${rb}/outbox/${id}/attempts`),
  retry: (id: number) => call<void>("POST", `${rb}/outbox/${id}/retry`),
  saveConfig: (operatorCode: string, callbackUrl: string, outboundEnabled: boolean) =>
    call<{ operatorCode: string; outboundEnabled: boolean }>("PUT", `${rb}/config`, { operatorCode, callbackUrl, outboundEnabled }),
  resync: (from: string, to: string) => call<{ sourceDestinations: number; searchEvents: number }>("POST", `${rb}/resync`, { from, to }),
  trips: (date: string) => call<TripRow[]>("GET", `/api/admin/trips?date=${date}`),
  cancelTrip: (id: number) => call<{ cancelledBookings: number }>("POST", `/api/admin/trips/${id}/cancel`),
  // operations
  vehicles: () => call<Vehicle[]>("GET", "/api/admin/vehicles"),
  saveVehicle: (v: Partial<Vehicle>, id?: number) => call<Vehicle>(id ? "PUT" : "POST", `/api/admin/vehicles${id ? `/${id}` : ""}`, { gpsEnabled: false, ...v }),
  staff: () => call<Staff[]>("GET", "/api/admin/staff"),
  saveStaff: (s: Partial<Staff>, id?: number) => call<Staff>(id ? "PUT" : "POST", `/api/admin/staff${id ? `/${id}` : ""}`, s),
  assignments: (tripId: number) => call<Assignment[]>("GET", `/api/admin/trips/${tripId}/assignments`),
  assign: (tripId: number, body: { role: string; vehicleId?: number; staffId?: number; reason?: string }) =>
    call<Assignment>("POST", `/api/admin/trips/${tripId}/assignments`, body),
  seats: (tripId: number) => call<SeatRow[]>("GET", `/api/admin/trips/${tripId}/seats`),
  block: (tripId: number, seats: string[], reason: string) => call<{ blocked: string[] }>("POST", `/api/admin/trips/${tripId}/blocks`, { seats, reason }),
  unblock: (tripId: number, seat: string) => call<{ released: number }>("DELETE", `/api/admin/trips/${tripId}/blocks/${encodeURIComponent(seat)}`),
  routes: () => call<RouteRow[]>("GET", "/api/admin/routes"),
  saveFares: (routeId: number, fares: Fare[]) => call<{ updated: number }>("PUT", `/api/admin/routes/${routeId}/fares`, fares),
  counterBook: (body: unknown) => call<CounterResult>("POST", "/api/admin/bookings/counter", body),
  invoices: () => call<InvoiceRow[]>("GET", "/api/admin/reconciliation/invoices"),
  uploadInvoice: (body: unknown) => call<{ id: number; duplicate: boolean }>("POST", "/api/admin/reconciliation/invoices", body),
  invoice: (id: number) => call<{ id: number; invoiceNumber: string; status: string; warningsJson: string | null; totals: Record<string, unknown> }>("GET", `/api/admin/reconciliation/invoices/${id}`),
  invoiceLines: (id: number, status?: string) => call<InvoiceLine[]>("GET", `/api/admin/reconciliation/invoices/${id}/lines${status ? `?status=${status}` : ""}`),
  recheck: (id: number) => call<unknown>("POST", `/api/admin/reconciliation/invoices/${id}/recheck`),
  resolve: (id: number, lineId: number, action: string, note: string) => call<unknown>("POST", `/api/admin/reconciliation/invoices/${id}/resolve`, { lineId, action, note }),
  exportInvoice: async (id: number, name: string) => {
    const res = await fetch(`/api/admin/reconciliation/invoices/${id}/export`, { headers: { "X-Admin-Key": getKey() } });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = `reconciliation-${name}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  },
};

export interface Vehicle { id: number; registrationNumber: string; coachTemplateId: number | null; status: string; modelName: string | null; gpsEnabled: boolean;
  insuranceExpiry: string | null; permitExpiry: string | null; fitnessExpiry: string | null; pucExpiry: string | null }
export interface Staff { id: number; name: string; phone: string; role: string; status: string; licenseNumber: string | null; licenseExpiry: string | null }
export interface Assignment { id: number; tripId: number; kind: string; vehicleId: number | null; staffId: number | null; role: string; isActive: boolean;
  assignedAt: string; replacedAt: string | null; replacedReason: string | null }
export interface SeatRow { seatCode: string; deck: string; row: number; col: number; seatType: string; occupied: boolean; state: string; gender: string | null }
export interface Fare { fromSequence: number; toSequence: number; seater: number; sleeperLower: number; sleeperUpper: number }
export interface RouteRow { id: number; name: string; serviceNumber: string; status: string; departureTime: string; fares: Fare[];
  stages: { id: number; kind: string; name: string; stopSequence: number; time: string }[] }
export interface CounterResult { pnr: string; status: string; totalFare: number; channel: string; payments: { amount: number; method: string; status: string }[] }
export interface InvoiceRow { id: number; invoiceNumber: string; fileName: string; periodStart: string; periodEnd: string; status: string; uploadedAt: string;
  uploadedBy: string; lines: number; outstanding: number }
export interface InvoiceLine { id: number; pnr: string; section: string; status: string; differences: string[]; why: string; fare: number | null;
  expectedFare: number | null; takeHome: number | null; expectedTakeHome: number | null; delta: number | null; doj: string | null; expectedDoj: string | null;
  resolutionAction: string | null; resolutionNote: string | null }
