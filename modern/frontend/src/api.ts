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
/** Credential: either a user session token (jos_…, from phone+password login) or an interim service key. */
export const getKey = () => sessionStorage.getItem(KEY) ?? "";
export const setKey = (k: string) => (k ? sessionStorage.setItem(KEY, k) : sessionStorage.removeItem(KEY));
export const authHeaders = (): Record<string, string> => {
  const k = getKey();
  return k.startsWith("jos_") ? { Authorization: `Bearer ${k}` } : { "X-Admin-Key": k };
};

export async function login(tenant: string, phone: string, password: string) {
  const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant, phone, password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `HTTP ${res.status}`);
  return data as { token: string; user: { name: string; role: string } };
}
export async function activate(tenant: string, phone: string, code: string, password: string) {
  const res = await fetch("/api/auth/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant, phone, code, password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `HTTP ${res.status}`);
  return data as { token: string; user: { name: string; role: string } };
}
export const logout = () => fetch("/api/auth/logout", { method: "POST", headers: authHeaders() }).catch(() => undefined);

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.message ?? data?.errorCode ?? `HTTP ${res.status}`);
  return data as T;
}

const rb = "/api/admin/integrations/redbus";
const pr = "/api/admin/payroll";

export type ScheduleStop = { cityId: number; name: string; state: string | null; day: number; time: string };
export type ScheduleStage = {
  id: number; kind: "pickup" | "drop"; name: string; address: string | null; landmark: string | null; contactNumber: string | null;
  lat: number | null; lng: number | null; day: number; time: string; prime: boolean; pickupType: string | null; cityId: number; city: string; passengers: number;
};
export type ScheduleHistoryRow = { pnr: string; seats: string[]; totalAmount: number; source: string; contactName: string; bookedAt: string; status: string };
export type TripSheetRow = { id: number; serviceNumber: string; serviceName: string; status: string; registration: string | null; staff: number };
export type TripStageRef = { id: number; name: string; time: string; day: number; pickupType?: string | null; exchangePoint?: string | null; exchangeTime?: string | null };
export type TripSheetPassenger = {
  pnr: string; seat: string; name: string; phone: string | null; source: string; status: string; callStatus: string | null; trips: number | null;
  boarding: TripStageRef | null; dropping: TripStageRef | null;
};
export type TripSheetStop = TripStageRef & { type: string; lat: number | null; lng: number | null; arrivedAt: string | null; departedAt: string | null };
export type TripSheet = {
  id: number; travelDate: string; status: string; serviceNumber: string; serviceName: string; origin: string; destination: string;
  vehicle: { id: number; registration: string } | null;
  crew: { role: string; staffId: number; name: string | null; phone: string | null }[];
  stops: TripSheetStop[]; passengers: TripSheetPassenger[];
  documents: { id: number; documentType: string; documentName: string; expiryDate: string | null; verificationStatus: string | null }[];
};
export type ScheduleDetail = {
  id: number; routeId: number; travelDate: string; status: string; bookable: boolean; serviceNumber: string; serviceName: string; coach: string;
  origin: string; destination: string; departureTime: string; arrivalTime: string; arrivalDay: number;
  stops: ScheduleStop[]; stages: ScheduleStage[]; history: ScheduleHistoryRow[];
};
export type CrmMapSeat = { code: string; row: number; col: number; w: number; h: number; type: string; status: string; fare: number | null; reservationCount: number; booking: { isCurrent: boolean } | null };
export type CrmDeck = { deck: string; rows: number; cols: number; seats: CrmMapSeat[] };
export type CrmPoint = { name: string; time: string | null; day?: number } | null;
export type CrmBooking = {
  pnr: string; ticketNumber: string | null; service: string; source: string; status: string; payment: string; paymentMethod: string | null;
  travelDate: string; bookedAt: string | null; scheduleId: number; routeId: number;
  passengers: { seat: string; name: string; gender: string | null; age: number | null; fare: number; status: string }[];
  fare: { gross: number; discount: number; net: number; gst: number; total: number; commission: number | null; milesDiscount: number };
  amount: number; from: string; to: string; boarding: CrmPoint; dropping: CrmPoint;
  contact: { name: string; phone: string | null; email: string | null }; comments: { text: string; by: string; at: string }[];
};
export type SalesDay = { date: string; bookings: number; seats: number; sales: number; offers: number; netSales: number; gst: number; cancelCharges: number; expense: number;
  commission: number; capacity: number; trips: number; asp: number; occupancyPct: number; fleetUtilPct: number; profit: number; byChannel: Record<string, number> };
export type SalesBreakdown = { value: string; name: string; bookings: number; seats: number; netSales: number; avgFare: number };
export type Sales = {
  from: string; to: string; basis: string; rows: SalesDay[]; channels: { source: string; bookings: number; seats: number; netSales: number }[];
  totals: { bookings: number; seats: number; sales: number; offers: number; netSales: number; asp: number; occupancyPct: number; fleetUtilPct: number; cancelCharges: number; gst: number; expense: number; profit: number };
  sectorBreakdown: SalesBreakdown[]; serviceBreakdown: SalesBreakdown[];
};
export type TxRow = { pnr: string; ticket: string; travelDate: string; service: string; source: string; passenger: string | null; phone: string | null; seats: string;
  payment: string | null; method: string | null; bookedBy: string; type: "booking" | "cancellation"; date: string; total: number; refund: number; charge: number; status: string };
export type Transactions = { rows: TxRow[]; services: { value: string; label: string }[]; totals: { bookings: number; credits: number; debits: number; net: number } };
export type SalesFacets = { sectors: { value: string; label: string }[]; services: { value: string; sector: string; label: string }[]; channels: string[] };
export const api = {
  sales: (q: Record<string, string>) => call<Sales>("GET", `/api/admin/accounts/sales?${new URLSearchParams(q)}`),
  salesFacets: () => call<SalesFacets>("GET", "/api/admin/accounts/sales-facets"),
  transactions: (q: Record<string, string>) => call<Transactions>("GET", `/api/admin/accounts/transactions?${new URLSearchParams(q)}`),
  exportTransactions: async (q: Record<string, string>) => {
    const res = await fetch(`/api/admin/accounts/transactions?${new URLSearchParams({ ...q, format: "csv" })}`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = `transactions__${q.from}_${q.to}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  },
  crmBooking: (pnr: string) => call<{ booking: CrmBooking; map: { coach: { id: number; name: string; capacity: number }; decks: CrmDeck[] } | null }>("GET", `/api/admin/crm/booking/${encodeURIComponent(pnr)}`),
  status: () => call<RedBusStatus>("GET", `${rb}/status`),
  outbox: (status?: string) => call<OutboxRow[]>("GET", `${rb}/outbox${status ? `?status=${status}` : ""}`),
  attempts: (id: number) => call<Attempt[]>("GET", `${rb}/outbox/${id}/attempts`),
  retry: (id: number) => call<void>("POST", `${rb}/outbox/${id}/retry`),
  saveConfig: (operatorCode: string, callbackUrl: string, outboundEnabled: boolean) =>
    call<{ operatorCode: string; outboundEnabled: boolean }>("PUT", `${rb}/config`, { operatorCode, callbackUrl, outboundEnabled }),
  resync: (from: string, to: string) => call<{ sourceDestinations: number; searchEvents: number }>("POST", `${rb}/resync`, { from, to }),
  trips: (date: string) => call<TripRow[]>("GET", `/api/admin/trips?date=${date}`),
  cancelTrip: (id: number) => call<{ cancelledBookings: number }>("POST", `/api/admin/trips/${id}/cancel`),
  setBoarding: (pnr: string, seat: string, status: "Boarded" | "No-Show" | "Yet-To-Board") => call<void>("POST", `/api/admin/bookings/${encodeURIComponent(pnr)}/boarding`, { seat, status }),
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
  schedules: (from: string, to: string) => call<{ schedules: ScheduleRow[] }>("GET", `/api/admin/schedules?from=${from}&to=${to}`),
  scheduleDetail: (id: number) => call<ScheduleDetail>("GET", `/api/admin/schedule-detail/${id}`),
  tripSheets: (date: string) => call<{ trips: TripSheetRow[] }>("GET", `/api/admin/trip-sheets?date=${date}`),
  tripSheet: (id: number | string) => call<TripSheet>("GET", `/api/admin/trip-sheets/${id}`),
  toggleSchedule: (id: number, active: boolean) => call<{ bookable: boolean }>("POST", `/api/admin/schedules/${id}/toggle`, { active }),
  routeList: () => call<{ routes: RouteListRow[] }>("GET", "/api/admin/route-list"),
  vehicleList: () => call<{ vehicles: VehicleListRow[] }>("GET", "/api/admin/vehicle-list"),
  setVehicleStatus: (id: number, status: string) => call<{ status: string }>("PUT", `/api/admin/vehicles/${id}/status`, { status }),
  coachList: () => call<{ coaches: CoachListRow[] }>("GET", "/api/admin/coach-list"),
  setCoachStatus: (id: number, status: string) => call<{ status: string }>("PUT", `/api/admin/coaches/${id}/status`, { status }),
  // staff payroll
  attendance: (from: string, to: string) => call<AttendanceGrid>("GET", `${pr}/attendance?from=${from}&to=${to}`),
  generateAttendance: (from: string, to: string) => call<{ generated: number }>("POST", `${pr}/attendance/generate`, { from, to }),
  approveAttendance: (b: { ids?: number[]; from?: string; to?: string }) => call<{ approved: number }>("POST", `${pr}/attendance/approve`, b),
  createAttendance: (b: { staffId: number; date: string; status?: string; amount?: number }) => call<unknown>("POST", `${pr}/attendance`, b),
  updateAttendance: (id: number, b: { status?: string; amount?: number; state?: string }) => call<unknown>("PUT", `${pr}/attendance/${id}`, b),
  payouts: (status?: string) => call<{ payouts: PayoutRow[] }>("GET", `${pr}/payouts${status ? `?status=${status}` : ""}`),
  payoutSummary: () => call<PayoutSummary>("GET", `${pr}/payouts/summary`),
  payoutPreview: (from: string, to: string) => call<{ rows: { staff_id: number; name: string; role: string; days: number; gross: number; advances_outstanding: number; reimbursements: number; prev_balance: number; net: number }[] }>("GET", `${pr}/payouts/preview?from=${from}&to=${to}`),
  generatePayouts: (b: { from: string; to: string; staffIds: number[]; deductAdvances: boolean }) => call<{ created: number; payouts: PayoutRow[] }>("POST", `${pr}/payouts/generate`, b),
  approvePayout: (id: number) => call<unknown>("POST", `${pr}/payouts/${id}/approve`),
  payPayout: (id: number, b: { paymentMode?: string; reference?: string | null }) => call<unknown>("POST", `${pr}/payouts/${id}/pay`, b),
  adjustPayout: (id: number, b: { gross?: number; deductions?: number }) => call<unknown>("PUT", `${pr}/payouts/${id}`, b),
  deletePayout: (id: number) => call<unknown>("DELETE", `${pr}/payouts/${id}`),
  staffLedger: (id: number) => call<unknown>("GET", `${pr}/staff/${id}/ledger`),
  advances: () => call<{ advances: AdvanceRow[]; summary: { total_outstanding: number; total_disbursed_this_month: number; overdue_count: number } }>("GET", `${pr}/advances`),
  createAdvance: (b: { staffId: number; amount: number; advanceType?: string; paymentMode?: string; recoveryMethod?: string; numInstallments?: number; dateIssued?: string; reason?: string }) => call<{ id: number }>("POST", `${pr}/advances`, b),
  recoverAdvance: (id: number, amount: number) => call<unknown>("POST", `${pr}/advances/${id}/recover`, { amount }),
  deleteAdvance: (id: number) => call<unknown>("DELETE", `${pr}/advances/${id}`),
  reimbursements: () => call<{ reimbursements: ReimbursementRow[]; summary: { total_pending: number; pending_count: number } }>("GET", `${pr}/reimbursements`),
  createReimbursement: (b: { staffId: number; amount: number; category?: string; date?: string; description?: string }) => call<{ id: number }>("POST", `${pr}/reimbursements`, b),
  reimbursementAction: (id: number, action: "approve" | "reject" | "pay") => call<unknown>("POST", `${pr}/reimbursements/${id}/${action}`),
  deleteReimbursement: (id: number) => call<unknown>("DELETE", `${pr}/reimbursements/${id}`),
  routeDetail: (id: number) => call<RouteDetail>("GET", `/api/admin/route-detail/${id}`),
  saveExpenseTemplate: (id: number, items: { type: string; key: string | null; label: string; perTrip: number }[]) =>
    call<unknown>("PUT", `/api/admin/routes/${id}/expense-template`, items),
  setRouteStatus: (id: number, status: "active" | "inactive") => call<{ status: string }>("PUT", `/api/admin/routes/${id}/status`, { status }),
  saveFares: (routeId: number, fares: Fare[]) => call<{ updated: number }>("PUT", `/api/admin/routes/${routeId}/fares`, fares),
  counterBook: (body: unknown) => call<CounterResult>("POST", "/api/admin/bookings/counter", body),
  invoices: () => call<InvoiceRow[]>("GET", "/api/admin/reconciliation/invoices"),
  uploadInvoice: (body: unknown) => call<{ id: number; duplicate: boolean }>("POST", "/api/admin/reconciliation/invoices", body),
  invoice: (id: number) => call<{ id: number; invoiceNumber: string; status: string; warningsJson: string | null; totals: Record<string, unknown> }>("GET", `/api/admin/reconciliation/invoices/${id}`),
  invoiceLines: (id: number, status?: string) => call<InvoiceLine[]>("GET", `/api/admin/reconciliation/invoices/${id}/lines${status ? `?status=${status}` : ""}`),
  recheck: (id: number) => call<unknown>("POST", `/api/admin/reconciliation/invoices/${id}/recheck`),
  resolve: (id: number, lineId: number, action: string, note: string) => call<unknown>("POST", `/api/admin/reconciliation/invoices/${id}/resolve`, { lineId, action, note }),
  exportInvoice: async (id: number, name: string) => {
    const res = await fetch(`/api/admin/reconciliation/invoices/${id}/export`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = `reconciliation-${name}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  },
  // identity
  me: () => call<Me>("GET", "/api/admin/me"),
  // CRM
  passengerSearch: (mode: string, q: string) => call<{ total: number; customers: CustomerHit[] }>("GET", `/api/admin/crm/passenger-search?mode=${mode}&q=${encodeURIComponent(q)}`),
  customer: (phone: string) => call<CustomerDetail>("GET", `/api/admin/crm/customers/${encodeURIComponent(phone)}`),
  addNote: (phone: string, text: string) => call<unknown>("POST", `/api/admin/crm/customers/${encodeURIComponent(phone)}/notes`, { text }),
  chats: (filter?: string) => call<{ conversations: Conversation[]; unreadTotal: number }>("GET", `/api/admin/chats${filter ? `?filter=${filter}` : ""}`),
  chat: (id: string) => call<{ messages: ChatMsg[]; templates: string[] }>("GET", `/api/admin/chats/${encodeURIComponent(id)}`),
  sendChat: (id: string, text: string) => call<{ notice: string }>("POST", `/api/admin/chats/${encodeURIComponent(id)}`, { text }),
  calls: () => call<{ calls: CallRow[]; stats: { total: number; answered: number; missed: number; avgDuration: number } }>("GET", "/api/admin/calls"),
  logCall: (body: unknown) => call<{ notice: string }>("POST", "/api/admin/calls", body),
  ratings: (max?: number) => call<{ rows: Rating[]; avg: number; distribution: number[] }>("GET", `/api/admin/ratings${max ? `?max=${max}` : ""}`),
  reply: (id: number, reply: string) => call<{ notice: string }>("POST", `/api/admin/ratings/${id}/reply`, { reply }),
  // reports
  report: <T,>(name: string, qs: string) => call<T>("GET", `/api/admin/reports/${name}?${qs}`),
  addExpense: (tripId: number, category: string, amount: number, note: string) => call<unknown>("POST", `/api/admin/trips/${tripId}/expenses`, { category, amount, note }),
  // accounts
  channels: () => call<{ agents: { channelKey: string; name: string; phone: string; commissionPct: number | null; active: boolean }[]; otas: { channelKey: string; name: string }[]; branches: { channelKey: string; name: string }[] }>("GET", "/api/admin/accounts/channels"),
  ledger: (channelKey: string) => call<Ledger>("GET", `/api/admin/accounts/ledger?channelKey=${encodeURIComponent(channelKey)}`),
  myLedger: () => call<Ledger>("GET", "/api/admin/me/ledger"),
  addLedger: (body: { channelKey: string; type: string; amount: number; note: string; date?: string }) => call<unknown>("POST", "/api/admin/accounts/ledger", body),
  voidLedger: (id: number) => call<unknown>("POST", `/api/admin/accounts/ledger/${id}/void`, {}),
  // Sarathi
  suggestions: () => call<string[]>("GET", "/api/admin/sarathi/suggestions"),
  ask: (question: string, conversationId?: number) => call<{ conversationId: number; answer: { text: string; table: Record<string, unknown>[]; intent: string; period: string } }>("POST", "/api/admin/sarathi/ask", { question, conversationId }),
  // IAM
  users: () => call<UserRow[]>("GET", "/api/admin/iam/users"),
  saveUser: (u: Partial<UserRow>, id?: number) => call<unknown>(id ? "PUT" : "POST", `/api/admin/iam/users${id ? `/${id}` : ""}`, u),
  setPassword: (id: number, password: string) => call<void>("POST", `/api/admin/iam/users/${id}/password`, { password }),
  invite: (id: number) => call<{ code: string; expiresAt: string; notice: string }>("POST", `/api/admin/iam/users/${id}/invite`, {}),
  audit: () => call<{ id: number; actor: string; action: string; entity: string; entityId: string; at: string }[]>("GET", "/api/admin/iam/audit"),
};

export interface ScheduleRow {
  id: number; routeId: number; travelDate: string; serviceNumber: string; serviceName: string; coach: string | null; origin: string | null; destination: string | null;
  departureTime: string; arrivalTime: string | null; arrivalDayOffset: number; mainFare: { seater: number; sleeperLower: number; sleeperUpper: number } | null;
  status: string; bookable: boolean; capacity: number; booked: number; held: number; blocked: number; free: number; occupancyPct: number;
  sale: number | null; netSales: number | null; expense: number | null; profit: number | null; expenseBasis: string | null;
}
export interface Me { name: string; role: string; tenant: string; auth: string; phone: string | null }
export interface BookingView { pnr: string; status: string; channel: string; travelDate: string; service: string; amount: number; from: string | null; to: string | null;
  contact: string | null; email?: string | null; issuedAt?: string | null; tripId?: number; boardingTime?: string | null;
  passengers: { seatCode: string; name: string; status: string; boardingStatus: string; age?: number | null; gender?: string | null; fare?: number | null }[] }
export interface CustomerHit { phone: string; phoneKey: string | null; name: string; tier: string; miles: number; totalTrips: number; totalBookings: number; cancelled: number;
  upcoming: number; cancellationPct: number; spend: number; lastTravel: string | null; bookings: BookingView[] }
export interface CustomerDetail { phone: string; name: string; loyalty: { tier: string; miles: number }; bookings: BookingView[]; notes: { id: number; text: string; by: string; at: string }[];
  calls: CallRow[]; messages: ChatMsg[]; ratings: Rating[] }
export interface Conversation { conversationId: string; name: string; phone: string; service: string; lastMessage: string; lastTs: string; channel: string; unread: number; blocked: boolean }
export interface ChatMsg { id: number; direction: string; text: string; ts: string; by: string | null; deliveryStatus: string }
export interface CallRow { id: number; direction: string; kind: string; phone: string; passengerName: string | null; pnr: string | null; status: string; durationS: number; agent: string; ts: string; notes: string | null }
export interface Rating { id: number; ota: string; pnr: string | null; passengerName: string | null; rating: number; ratedAt: string; review: string | null; operatorReply: string | null }
export interface Ledger { channelKey: string; balance: number; totalDebits: number; totalCredits: number;
  entries: { date: string; kind: string; ref: string; debit: number; credit: number; note: string; id: number | null; balance: number }[] }
export interface UserRow { id: number; phone: string; name: string; email: string | null; role: string; status: string; legacyRole: string | null; commissionPct: number | null;
  creditLimit: number | null; hasPassword: boolean; invitePendingUntil: string | null; lastLoginAt: string | null; locked: boolean }

export interface Vehicle { id: number; registrationNumber: string; coachTemplateId: number | null; status: string; modelName: string | null; gpsEnabled: boolean;
  insuranceExpiry: string | null; permitExpiry: string | null; fitnessExpiry: string | null; pucExpiry: string | null;
  ownershipType?: string | null; phoneNumber?: string | null; manufactureYear?: number | null; vehicleRole?: string | null }
export interface Telemetry { lat?: number | null; lng?: number | null; speed?: number | null; state?: string; ts?: number | string; state_since?: number | string }
export interface VehicleHealth { status?: string; odometer_km?: number; engine_hours?: number; def_inhibit?: boolean; alerts?: { message: string; status: string; reading?: number; unit?: string }[]; fuel?: { fuel_l?: number; remaining_l?: number; adblue_l?: number } }
export interface VehicleListRow { id: number; registrationNumber: string; coachTemplateId: number | null; coach: string | null; status: string; vehicleRole: string | null;
  gpsEnabled: boolean; modelName: string | null; odometerReading: number | null; position: Telemetry | null; health: VehicleHealth | null; docAlerts: number }
export interface CoachListRow { id: number; name: string; busType: string; pattern: string; status: string; amenities: string[]; seater: number; sleeper: number; capacity: number }
export interface AttendanceCell { id: number; status: string; state: string; amount: number; service: string | null }
export interface AttendanceGrid { from: string; to: string; dates: string[]; staff: { staff_id: number; name: string | null; role: string | null; phone: string | null; days: Record<string, AttendanceCell>; present: number; amount: number; draft: number }[] }
export interface PayoutRow { id: number; payout_no: string; staff_id: number; period_start: string; period_end: string; days: number; gross: number; deductions: number; advances_recovered: number; reimbursements: number | null; net: number; status: string; approved_by: string | null; paid_at: string | null; payment_mode: string | null; reference: string | null; staff_name: string | null; staff_role: string | null }
export interface PayoutSummary { total_paid_this_month: number; total_pending_approval: number; total_approved_unpaid: number; payouts_count_this_month: number }
export interface AdvanceRow { id: number; staff_id: number; advance_type: string; amount: number; date_issued: string; reason: string | null; payment_mode: string; recovery_method: string; amount_recovered: number; status: string; balance: number; staff_name: string | null; staff_role: string | null }
export interface ReimbursementRow { id: number; staff_id: number; category: string; amount: number; date: string; description: string; receipt: string | null; status: string; by: string | null; staff_name: string | null }
export interface Staff { id: number; name: string; phone: string; role: string; status: string; licenseNumber: string | null; licenseExpiry: string | null;
  designation?: string | null; salaryType?: string | null; salaryAmount?: number | null; bataPerTrip?: number | null;
  email?: string | null; bloodGroup?: string | null; joiningDate?: string | null }
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

export interface RouteListRow {
  id: number; serviceNumber: string; name: string; altName: string | null; status: string;
  departureTime: string; arrivalTime: string | null; arrivalDay: number; durationMinutes: number | null;
  origin: { name: string; state: string | null } | null; destination: { name: string; state: string | null } | null;
  via: string[]; coach: { id: number; name: string; capacity: number } | null; startDate: string | null; endDate: string | null;
}

export interface RouteStageRow { id: number; kind: string; name: string; address: string | null; landmark: string | null; contactNumber: string | null;
  lat: number | null; lng: number | null; day: number; time: string; prime: boolean; cityId: number; city: string | null;
  pickupType: string | null; exchangePoint: string | null; exchangeTime: string | null; metroDescription: string | null }
export interface RouteDetail {
  id: number; serviceNumber: string; name: string; altName: string | null; status: string; departureTime: string; arrivalTime: string | null;
  arrivalDay: number | null; startDate: string | null; endDate: string | null; partialCancellationAllowed: boolean; maxSeatsPerTicket: number; updateCutoffMinutes: number;
  coach: { id: number; name: string; pattern: string; capacity: number; seaters: number; sleepers: number } | null;
  stops: { sequence: number; cityId: number; city: string | null; state: string | null; lat: number | null; lng: number | null; day: number; time: string }[];
  stages: RouteStageRow[];
  fares: { fromSequence: number; toSequence: number; from: string | null; to: string | null; seater: number; sleeperLower: number; sleeperUpper: number }[];
  refundSlabs: { hoursBefore: number; refundPercent: number }[];
  seatFareRules: { kind: string; label: string; seats: string[]; days: string[]; value: number }[];
  expenses: { type: string; key: string; label: string; perTrip: number }[];
  history: { action: string; actor: string; at: string }[];
}
