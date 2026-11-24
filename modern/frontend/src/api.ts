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
};
