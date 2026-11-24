import type { ScheduleSeatLayout } from "./features/schedules/seatLayoutModel";
import type { CoachDraft, FullCoach, CoachListItem } from "./features/coaches/coachModel";
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
  vehicleDocuments: (id:number)=>call<ComplianceDocument[]>("GET","/api/admin/vehicles/"+id+"/documents"),
  staffDocuments: (id:number)=>call<ComplianceDocument[]>("GET","/api/admin/staff/"+id+"/documents"),
  staffDuties: (id:number)=>call<StaffDuty[]>("GET","/api/admin/staff/"+id+"/duties"),
  saveVehicle: (v: Partial<Vehicle>, id?: number) => call<Vehicle>(id ? "PUT" : "POST", `/api/admin/vehicles${id ? `/${id}` : ""}`, { gpsEnabled: false, ...v }),
  staff: () => call<Staff[]>("GET", "/api/admin/staff"),
  saveStaff: (s: Partial<Staff>, id?: number) => call<Staff>(id ? "PUT" : "POST", `/api/admin/staff${id ? `/${id}` : ""}`, s),
  assignments: (tripId: number) => call<Assignment[]>("GET", `/api/admin/trips/${tripId}/assignments`),
  assign: (tripId: number, body: { role: string; vehicleId?: number; staffId?: number; reason?: string }) =>
    call<Assignment>("POST", `/api/admin/trips/${tripId}/assignments`, body),
  seats: (tripId: number) => call<SeatRow[]>("GET", `/api/admin/trips/${tripId}/seats`),
  scheduleLayout: (tripId: number, fromSequence?: number, toSequence?: number) =>
    call<ScheduleSeatLayout>("GET", "/api/admin/trips/" + tripId + "/seat-layout?" +
      new URLSearchParams([...(fromSequence === undefined ? [] : [["fromSequence", String(fromSequence)]]),
        ...(toSequence === undefined ? [] : [["toSequence", String(toSequence)]]),
        ["refresh", String(Date.now())]]).toString()),
  bookingShare: (tripId: number, fromSequence: number, toSequence: number) =>
    call<PassengerBookingShare>("GET", "/api/admin/trips/" + tripId + "/share-link?" +
      new URLSearchParams({fromSequence:String(fromSequence),toSequence:String(toSequence)}).toString()),
  tripHistory: (tripId: number) =>
    call<TripHistoryEvent[]>("GET", "/api/admin/trips/" + tripId + "/history"),
  bookingChart: (tripId: number) =>
    call<ScheduleBookingChart[]>("GET", "/api/admin/trips/" + tripId + "/booking-chart"),
  blockSegment: (tripId: number, seats: string[], reason: string, fromSequence: number, toSequence: number) =>
    call<{ blocked: string[] }>("POST", "/api/admin/trips/" + tripId + "/blocks", {
      seats, reason, fromSequence, toSequence
    }),

  block: (tripId: number, seats: string[], reason: string) => call<{ blocked: string[] }>("POST", `/api/admin/trips/${tripId}/blocks`, { seats, reason }),
  unblock: (tripId: number, seat: string) => call<{ released: number }>("DELETE", `/api/admin/trips/${tripId}/blocks/${encodeURIComponent(seat)}`),
  routes: () => call<RouteRow[]>("GET", "/api/admin/routes"),
  cities: () => call<CityOption[]>("GET", "/api/admin/cities"),
  coaches: () => call<CoachOption[]>("GET", "/api/admin/coaches"),
  coachInventory: () => call<CoachListItem[]>("GET", "/api/admin/coaches/detailed"),
  coachFull: (id: number) => call<FullCoach>("GET", "/api/admin/coaches/" + id + "/full"),
  saveCoach: (draft: CoachDraft, id?: number) => call<{id:number}>(id ? "PUT" : "POST",
    "/api/admin/coaches" + (id ? "/" + id : ""), draft),
  routeFull: (id: number) => call<FullRoute>("GET", "/api/admin/routes/" + id + "/full"),
  saveRoute: (draft: RouteDraft, id?: number) =>
    call<{id:number}>(id ? "PUT" : "POST", "/api/admin/routes" + (id ? "/" + id : ""), draft),
  generateRoute: (id: number, from: string, to: string) =>
    call<{created:number}>("POST", "/api/admin/routes/" + id + "/generate", {from,to}),

  saveFares: (routeId: number, fares: Fare[]) => call<{ updated: number }>("PUT", `/api/admin/routes/${routeId}/fares`, fares),
  counterBook: (body: unknown) => call<CounterResult>("POST", "/api/admin/bookings/counter", body),
  bookingSearch: (date: string, q: string) => call<BookingListRow[]>("GET",
    "/api/admin/bookings?" + new URLSearchParams({date,q,take:"100"}).toString()),
  bookingWorkspace: (pnr: string) => call<BookingWorkspaceView>("GET",
    "/api/admin/bookings/" + encodeURIComponent(pnr) + "/workspace"),
  bookingHistory: (pnr: string) => call<BookingHistoryEvent[]>("GET",
    "/api/admin/bookings/" + encodeURIComponent(pnr) + "/history"),
  bookingShiftOptions: (pnr:string,date:string) => call<BookingShiftOption[]>("GET",
    "/api/admin/bookings/" + encodeURIComponent(pnr) + "/shift-options?date=" + date),
  bookingCancellationQuote: (pnr:string,seats:string[]) => call<BookingCancelQuote>("GET",
    "/api/admin/bookings/" + encodeURIComponent(pnr) + "/cancellation-quote?" +
      new URLSearchParams({seats:seats.join(",")}).toString()),
  bookingUpdate: (pnr:string,body:{mobile:string|null;boardingAt:number|null;dropOff:number|null}) =>
    call<{pnr:string;notice:string}>("PUT","/api/admin/bookings/"+encodeURIComponent(pnr)+"/update",body),
  bookingComment: (pnr:string,text:string) => call<{notice:string}>("POST",
    "/api/admin/bookings/"+encodeURIComponent(pnr)+"/comments",{text}),
  bookingCancel: (pnr:string,seats:string[],reason:string,notes:string) =>
    call<{pnr:string;status:string;charge:number;refund:number;at:string;refundObligation:string;refundPaymentCompleted:boolean}>(
      "POST","/api/admin/bookings/"+encodeURIComponent(pnr)+"/cancel",{seats,reason,notes}),
  bookingShift: (pnr:string,tripId:number,seats:string[]) =>
    call<{pnr:string;tripId:number;seats:string[]}>("POST",
      "/api/admin/bookings/"+encodeURIComponent(pnr)+"/shift",{tripId,seats}),
  bookingBoarding: (pnr:string,seat:string,status:string) =>
    call<void>("POST","/api/admin/bookings/"+encodeURIComponent(pnr)+"/boarding",{seat,status}),

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
  ratingFollowUp: (id: number, status: string, note: string) =>
    call<unknown>("PUT","/api/admin/ratings/"+id+"/follow-up",{status,note}),
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

export interface Me { name: string; role: string; tenant: string; auth: string; phone: string | null }
export interface BookingView { pnr: string; status: string; channel: string; travelDate: string; service: string; amount: number; from: string | null; to: string | null;
  contact: string | null; passengers: { seatCode: string; name: string; status: string; boardingStatus: string }[] }
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
  manufactureYear?:number|null;ownershipType?:string|null;phoneNumber?:string|null;
  insuranceExpiry: string | null; permitExpiry: string | null; fitnessExpiry: string | null; pucExpiry: string | null }
export interface Staff { id: number; name: string; phone: string; role: string; status: string; licenseNumber: string | null; licenseExpiry: string | null;
  designation?:string|null;salaryType?:string|null;salaryAmount?:number|null;bataPerTrip?:number|null }
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

export interface ScheduleBookingChart {
  pnr: string;
  status: string;
  channel: string;
  totalFare: number;
  passengers: { seatCode: string; name: string; status: string; boardingStatus: string }[];
}

export interface CityOption { id:number;name:string;state:string|null;countryName:string }
export interface CoachOption { id:number;name:string;pattern:string;busType:string;isAc:boolean;
  seatCount:number;seaterCount:number;sleeperCount:number }
export interface RouteStopDraft { cityId:number;day:number;time:string; }
export interface RouteStageDraft { stopSequence:number;kind:"pickup"|"drop";name:string;day:number;time:string;
  address:string|null;landmark:string|null;contactNumber:string|null;prime:boolean; }
export interface RouteDraft { serviceNumber:string;name:string;coachTemplateId:number;departureTime:string;
  status:"draft"|"active"|"inactive";partialCancellationAllowed:boolean;primaryPaxCancellable:boolean;
  maxSeatsPerTicket:number;updateCutoffMinutes:number;stops:RouteStopDraft[];
  stages:RouteStageDraft[];fares:Fare[]; }
export interface FullRoute extends RouteDraft {
  id:number;coachName:string|null;structuralLocked:boolean;
  stops:(RouteStopDraft&{sequence:number;cityName:string})[];
  stages:(RouteStageDraft&{id:number})[];
}

export interface TripHistoryEvent { id:number; at:string; action:string; actor:string }

export interface PassengerBookingShare {
  tripId: number; serviceNumber: string; from: string; to: string;
  boardingDate: string; url: string; message: string;
  linkType: "route_date_search"; preselectsService: false;
}
export interface TripPnlLine {
  type: "fixed" | "running" | "other";key:string;label:string;
  amount:number;basis:"actual"|"estimate";estimate:number|null;
}
export interface TripPnlRow {
  tripId:number;routeId:number;date:string;service:string;route:string;running:boolean;
  capacity:number;seats:number;occupancyPct:number;netSales:number;
  cancellationCharges:number;expense:number;expenseActual:number;expenseEstimated:number;
  expenseBasis:"actual"|"estimate"|"mixed"|"none";profit:number;expenses:TripPnlLine[];
}
export interface TripPnlReport { rows:TripPnlRow[]; summary:{
  trips:number;netSales:number;expense:number;expenseActual:number;
  expenseEstimated:number;profit:number;lossTrips:number;expenseBasis:string;
} }

export interface BookingListRow {
  pnr:string;tripId:number;channel:string;status:string;totalFare:number;
  dateOfIssue:string;seatCount:number;
  passengers:{seatCode:string;name:string;status:string;boardingStatus:string}[];
}
export interface BookedStage {
  id:number;name:string;address:string|null;landmark:string|null;
  contactNumber:string|null;day:number;time:string;stopSequence:number;
}
export interface BookedPassenger {
  id:number;seatCode:string;name:string;title:string|null;gender:string;age:number;
  status:string;boardingStatus:string;fare:number;baseFare:number;gst:number;
  isPrimary:boolean;cancellationCharge:number;refundAmount:number;cancelledAt:string|null;
}
export interface BookingWorkspaceView {
  id:number;pnr:string;status:string;channel:string;tripId:number;fromSeq:number;toSeq:number;
  totalFare:number;currency:string;dateOfIssue:string;dateOfCancellation:string|null;
  cancellationPolicy:string;contactMobile:string|null;contactEmail:string|null;
  boardingStageId:number;droppingStageId:number;travelDate:string;routeId:number;
  routeName:string;serviceNumber:string;coachName:string|null;fromCity:string;toCity:string;
  fromCityId:number;toCityId:number;boarding:BookedStage|null;dropping:BookedStage|null;
  availableBoarding:BookedStage[];availableDropping:BookedStage[];
  passengers:BookedPassenger[];
  refunds:{amount:number;status:string;createdAt:string;seats:string[];charge:number;refund:number}[];
}
export interface BookingHistoryEvent {
  id:number;at:string;actor:string;action:string;comment:string|null;
}
export interface BookingShiftOption {
  id:number;travelDate:string;routeId:number;serviceNumber:string;routeName:string;
  coachName:string|null;fromSequence:number;toSequence:number;departure:string;
  stagesOkay:boolean;
}
export interface BookingCancelQuote {
  pnr:string;percent:number;totalFare:number;charge:number;refund:number;
  breakdown:{seatCode:string;name:string;fare:number;charge:number;refund:number}[];
  subjectToRevalidation:boolean;payoutStatus:string;
}

export interface DailyOpsReport {
  date:string;
  fleet:{trips:{tripId:number;service:string;route:string;status:string;
    vehicle:string|null;crew:{role:string;name:string;phone:string}[];
    seats:number;capacity:number;occupancyPct:number;netSales:number}[];
    summary:{trips:number;running:number;withoutBus:number;seats:number;capacity:number}};
  earnings:{bookings:number;seats:number;amount:number;cancelledToday:number;
    byChannel:{channel:string;bookings:number;amount:number}[];
    next7:{date:string;trips:number;seats:number;capacity:number;occupancyPct:number}[]};
  passengers:{noShowsYesterday:{pnr:string;service:string;seat:string;passenger:string;contact:string|null}[]};
  compliance:{vehicleDocuments:{vehicle:string|null;document:string;expiryDate:string;state:string}[];
    licences:{name:string;role:string;phone:string;licenseExpiry:string;state:string}[]};
  ratings:{average:number|null;count:number;low:{id:number;ota:string;pnr:string|null;
    rating:number;review:string|null;ratedAt:string;operatorReply:string|null}[]};
}

export interface ComplianceDocument { id:number;documentType:string;documentName:string;
  expiryDate:string|null;category:string|null;verificationStatus:string|null;
  source:"metadata_only";downloadAvailable:false }

export interface StaffDuty {
  id:number;tripId:number;travelDate:string;status:string;role:string;serviceNumber:string;routeName:string;
  isActive:boolean;assignedAt:string;replacedAt:string|null;replacedReason:string|null;
}
