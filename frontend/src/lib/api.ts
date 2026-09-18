// ===========================================================================
//  api.ts — the single place where the app talks to the CampusPulse backend.
//
//  FINDING THE BACKEND
//  -------------------
//  The app does not assume one fixed URL. It tries several, in order, and
//  keeps the first that answers /health:
//
//    1. VITE_API_URL from frontend/.env, if you set one (use in production)
//    2. <this page's origin>/api  — the Vite dev proxy in vite.config.ts.
//       This works no matter which address you opened the page from,
//       including from your phone on the same Wi-Fi.
//    3. <this page's host>:8000  — the API on the same machine, direct
//    4. http://localhost:8000 / http://127.0.0.1:8000 — last resort
//
//  SESSIONS
//  --------
//  Most of this platform needs no session at all: the room board, the
//  buildings and the bus timetable are public. Logging in returns a JWT which
//  is kept in localStorage and sent as  Authorization: Bearer <token>  — used
//  only by the student, driver and administrator screens.
// ===========================================================================

const TOKEN_KEY = "campuspulse_token";
const BASE_CACHE_KEY = "campuspulse_api_base";

function candidateBaseUrls(): string[] {
  const list: string[] = [];
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured.trim()) list.push(configured.trim().replace(/\/+$/, ""));

  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;
    list.push(`${origin}/api`);
    list.push(`${protocol}//${hostname}:8000`);
  }
  list.push("http://localhost:8000");
  list.push("http://127.0.0.1:8000");

  return list.filter((value, index) => value && list.indexOf(value) === index);
}

export const API_BASE_GUESS = candidateBaseUrls()[0] ?? "http://localhost:8000";

let resolvedBase: string | null = null;
let resolving: Promise<string> | null = null;

async function pingHealth(base: string, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveApiBase(): Promise<string> {
  if (resolvedBase) return resolvedBase;
  if (resolving) return resolving;

  resolving = (async () => {
    try {
      const cached = sessionStorage.getItem(BASE_CACHE_KEY);
      if (cached && (await pingHealth(cached))) {
        resolvedBase = cached;
        return cached;
      }
    } catch {
      /* sessionStorage blocked — just probe */
    }

    for (const candidate of candidateBaseUrls()) {
      if (await pingHealth(candidate)) {
        resolvedBase = candidate;
        try {
          sessionStorage.setItem(BASE_CACHE_KEY, candidate);
        } catch {
          /* ignore */
        }
        return candidate;
      }
    }

    throw new ApiError(
      0,
      "Cannot reach the CampusPulse server. Start the backend first:\n" +
        "    cd backend && npm run dev\n" +
        "then reload this page.",
    );
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- session token ---------------------------------------------------------

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the session then lasts for this page only */
  }
}

// --- requests --------------------------------------------------------------

type RequestOptions = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined> };

export async function request<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
  const base = await resolveApiBase();
  const url = new URL(`${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    resolvedBase = null; // the address may have changed — probe again next time
    throw new ApiError(0, "Cannot reach the CampusPulse server. Is the backend still running?");
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : "";
    const message = detail || `Request failed (${response.status}).`;
    if (response.status === 401) setToken(null);
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export const api = {
  get: <T>(pathname: string, query?: RequestOptions["query"]) => request<T>(pathname, { query }),
  post: <T>(pathname: string, body?: unknown) => request<T>(pathname, { method: "POST", body }),
  patch: <T>(pathname: string, body?: unknown) => request<T>(pathname, { method: "PATCH", body }),
  delete: <T>(pathname: string) => request<T>(pathname, { method: "DELETE" }),
};

// ===========================================================================
//  Shared response types
// ===========================================================================

export type Role = "admin" | "agent" | "user";

export type SessionUser = {
  id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  status: "active" | "inactive";
  lastSignedIn: string;
};

export type Health = {
  status: string;
  engine: "c++" | "typescript";
  database: string;
  postgres: string | null;
  campusTime: string;
  campusDate: string;
  campusMinute: number;
  timezone: string;
};

// --- rooms and the timetable ------------------------------------------------

export type SessionOrigin = "timetable" | "moved_in" | "retimed" | "extra" | "closure" | "booking";

export type EffectiveSession = {
  entryId: number | null;
  exceptionId: number | null;
  roomId: number;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  label: string;
  batchName: string | null;
  subjectName: string | null;
  teacher: string | null;
  origin: SessionOrigin;
  note: string | null;
  /** Bookings only — lets a screen offer "give it back". */
  bookingId?: number;
};

// --- room bookings ----------------------------------------------------------

/** Who the current visitor is allowed to be, booking-wise. */
export type BookingRules = {
  mayBook: boolean;
  signedIn: boolean;
  limits: { minMinutes: number; maxMinutes: number; maxDaysAhead: number; maxOpenPerAgent: number };
};

export type RoomBookingRow = {
  booking: {
    id: number;
    roomId: number;
    bookedById: number;
    onDate: string;
    startMinute: number;
    endMinute: number;
    purpose: string | null;
    attendees: number | null;
    status: "pending" | "confirmed" | "cancelled";
    cancelReason: string | null;
    createdAt: string;
  };
  roomNumber: string;
  buildingCode: number;
  buildingName: string;
  floorLevel: number;
  capacity: number;
  ownerName: string | null;
  ownerUsername: string | null;
  startTime: string;
  endTime: string;
};

export type RoomStatus = "available" | "occupied" | "closed";

export type RoomAvailability = {
  status: RoomStatus;
  current: EffectiveSession | null;
  next: EffectiveSession | null;
  freeAtMinute: number | null;
  freeAtTime: string | null;
  freeForMinutes: number;
  freeForLabel: string;
  endingSoon: boolean;
  sessions: EffectiveSession[];
};

export type RoomCard = {
  id: number;
  roomNumber: string;
  buildingCode: number;
  buildingName: string;
  floorLevel: number;
  name: string | null;
  kind: RoomKind;
  capacity: number;
  availability: RoomAvailability;
};

export type Moment = {
  dateKey: string;
  dayOfWeek: number;
  minute: number;
  isToday: boolean;
  clock: string;
  dateLabel: string;
  timezone: string;
  serverTimeLabel: string;
};

export type RoomBoard = {
  moment: Moment;
  holiday: { reason: string } | null;
  summary: { total: number; available: number; occupied: number; closed: number };
  rooms: RoomCard[];
};

export type CampusPulseSummary = {
  moment: Moment;
  holiday: { reason: string } | null;
  total: number;
  available: number;
  occupied: number;
  closed: number;
  nextBreak: { count: number; freeAtTime: string } | null;
  sample: Array<{ roomNumber: string; buildingName: string; floorLevel: number; freeForMinutes: number; freeForLabel: string; nextAt: string | null }>;
};

export type BuildingRow = {
  id: number;
  code: number;
  name: string;
  shortName: string | null;
  roomCount: number;
  /** Where it stands on the campus map; null until an administrator places it. */
  latitude: string | null;
  longitude: string | null;
  /** How many of this building's rooms are free at the moment asked about. */
  availableNow: number;
  floors: Array<{ id: number; level: number; label: string | null; roomCount: number; availableNow: number }>;
};

/** GET /rooms/buildings */
export type BuildingOverview = {
  moment: Moment;
  holiday: { reason: string } | null;
  buildings: BuildingRow[];
};

export const ROOM_KINDS = ["lecture", "department", "library", "lab", "office", "seminar", "studio"] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];
export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  lecture: "Lecture Room",
  department: "Department",
  library: "Library",
  lab: "Lab",
  office: "Office",
  seminar: "Seminar Room",
  studio: "Studio",
};

export type RoomDetail = {
  moment: Moment;
  room: {
    id: number;
    roomNumber: string;
    buildingCode: number;
    floorLevel: number;
    position: number;
    name: string | null;
    kind: RoomKind;
    capacity: number;
    notes: string | null;
    active: boolean;
    buildingName: string;
    floorLabel: string | null;
    /** Null when the building has not been placed on the campus map. */
    buildingLatitude: string | null;
    buildingLongitude: string | null;
  };
  availability: RoomAvailability;
  movedAway: Array<{ exceptionId: number; reason: string | null }>;
};

export type RoomWeek = {
  room: { id: number; roomNumber: string; buildingCode: number; floorLevel: number; name: string | null };
  days: Array<{
    dayOfWeek: number;
    sessions: Array<{
      id: number;
      startMinute: number;
      endMinute: number;
      startTime: string;
      endTime: string;
      title: string | null;
      teacher: string | null;
      batchName: string | null;
      batchCode: string | null;
      subjectName: string | null;
      subjectCode: string | null;
    }>;
  }>;
};

export type ExceptionKind = "cancel" | "move_room" | "retime" | "extra" | "holiday" | "room_closed";

export type ExceptionRow = {
  exception: {
    id: number;
    kind: ExceptionKind;
    onDate: string;
    entryId: number | null;
    roomId: number | null;
    newRoomId: number | null;
    title: string | null;
    teacher: string | null;
    startMinute: number | null;
    endMinute: number | null;
    reason: string | null;
    createdAt: string;
  };
  roomNumber: string | null;
  newRoomNumber: string | null;
  batchName: string | null;
  subjectName: string | null;
  entryDayOfWeek: number | null;
  entryStartMinute: number | null;
  entryEndMinute: number | null;
  entryRoomId: number | null;
};

// --- the administrator's catalogue -----------------------------------------

export type AdminRoom = {
  room: {
    id: number;
    roomNumber: string;
    buildingCode: number;
    floorLevel: number;
    position: number;
    name: string | null;
    kind: RoomKind;
    capacity: number;
    active: boolean;
    notes: string | null;
  };
  buildingName: string;
  buildingCode: number;
};

export type BatchRow = {
  id: number;
  code: string;
  name: string;
  department: string | null;
  yearLevel: number | null;
  studentCount: number | null;
  active: boolean;
};

export type SubjectRow = { id: number; code: string; name: string; department: string | null; active: boolean };

export type TimetableRow = {
  entry: {
    id: number;
    roomId: number;
    batchId: number | null;
    subjectId: number | null;
    title: string | null;
    teacher: string | null;
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    active: boolean;
  };
  roomNumber: string;
  buildingCode: number;
  floorLevel: number;
  batchName: string | null;
  batchCode: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  startTime: string;
  endTime: string;
};

// ===========================================================================
//  School bus — unchanged from the existing system
// ===========================================================================

export type RouteRow = {
  route: {
    id: number;
    name: string;
    driverId: number | null;
    vehicleId: number | null;
    startPoint: string;
    destination: string;
    pickupLocations: string;
    mapUrl: string | null;
    mapCoordinates: string | null;
    routeLineColor: string;
    distanceKm: number | null;
    estimatedMinutes: number | null;
    fareCents: number;
    /** The bus leaves at these two times every day — that is the timetable. */
    morningTime: string;
    eveningTime: string | null;
    /** The months this route is sold for. */
    sellFrom: string | null;
    sellTo: string | null;
    status: "active" | "inactive";
  };
  driverName: string | null;
  /** The driver's phone number — the student pays them outside the app. */
  driverPhone: string | null;
  vehiclePlate: string | null;
  vehicleSeats: number | null;
  vehicleStatus: string | null;
  stops: Array<{ id: number; name: string; stopOrder: number }>;
  mapNodes: Array<{ id: number; name: string; latitude: string; longitude: string; nodeOrder: number }>;
};

export type VehicleRow = {
  vehicle: {
    id: number;
    driverId: number | null;
    plateNumber: string | null;
    vehicleType: string;
    model: string;
    totalSeats: number;
    monthlyFeeCents: number;
    status: "operational" | "unavailable" | "maintenance";
    maintenanceStatus: "clear" | "reported" | "in_service";
  };
  driverName: string | null;
  driverUsername: string | null;
};

export type DriverDashboard = {
  profile: { profile: { id: number; phone: string | null; licenseNumber: string | null; availability: "available" | "unavailable" }; user: SessionUser } | undefined;
  vehicle: VehicleRow | null;
  routes: RouteRow[];
};

// --- small shared helpers ---------------------------------------------------

/** 540 -> "09:00" — the same rule the backend uses, for forms and labels. */
export function minutesToClock(minutes: number) {
  const safe = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** "09:00" -> 540, or null. */
export function clockToMinutes(clock: string): number | null {
  const match = /^([01]\d|2[0-3]|24):([0-5]\d)$/.exec(clock.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
