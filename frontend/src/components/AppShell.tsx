// ===========================================================================
//  AppShell.tsx — the frame EVERY screen sits in, signed in or not.
//
//  There is deliberately ONE shell rather than a public site and a separate
//  portal: public visitors, room-booking agents and administrators share the
//  same navigation shell.
//
//    * a fixed top bar with the wordmark, the campus clock and the account
//    * a 256px side rail on desktop
//    * a pinned bottom bar on phones — navigation has to stay reachable while
//      the student is walking around campus, which is the whole use case
//
//  PUBLIC items are always present. Role items are appended for whoever is
//  signed in; a signed-out visitor sees a "Agent login" button instead.
// ===========================================================================

import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bus,
  Building2,
  CalendarCheck,
  CalendarClock,
  Clock,
  DoorOpen,
  LayoutDashboard,
  LogIn,
  LogOut,
  Map as MapIcon,
  Menu as MenuIcon,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { LANGUAGE_NAMES } from "@/lib/i18n";
import { initials } from "@/lib/format";
import type { Role } from "@/lib/api";

type NavItem = { href: string; label: string; short?: string; icon: ReactNode; context?: "rooms" | "bus" };

/** Open to everyone, no account. These come first for every visitor. */
const PUBLIC_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: <LayoutDashboard className="h-5 w-5" /> },
  { href: "/find", label: "Find a Room", short: "Find", icon: <Search className="h-5 w-5" />, context: "rooms" },
  { href: "/buildings", label: "Buildings & Rooms", short: "Rooms", icon: <Building2 className="h-5 w-5" />, context: "rooms" },
  { href: "/timetable", label: "Timetable", icon: <CalendarClock className="h-5 w-5" />, context: "rooms" },
  { href: "/bus", label: "School Bus", short: "Bus", icon: <Bus className="h-5 w-5" />, context: "bus" },
];

/** Added on top of the public items, for whoever is signed in. */
const ROLE_NAV: Record<Role, NavItem[]> = {
  user: [{ href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" /> }],
  admin: [
    { href: "/admin", label: "Admin Overview", short: "Admin", icon: <ShieldCheck className="h-5 w-5" /> },
    { href: "/agent", label: "Room Bookings", short: "Bookings", icon: <CalendarCheck className="h-5 w-5" />, context: "rooms" },
    { href: "/admin/bus", label: "Bus Management", short: "Buses", icon: <Bus className="h-5 w-5" />, context: "bus" },
    { href: "/admin/bus/route", label: "Route & Map", short: "Route", icon: <MapIcon className="h-5 w-5" />, context: "bus" },
    { href: "/admin/timetable", label: "Timetable Manager", short: "Timetable", icon: <CalendarClock className="h-5 w-5" />, context: "rooms" },
    { href: "/admin/campus", label: "Campus & Rooms", short: "Campus", icon: <Building2 className="h-5 w-5" />, context: "rooms" },
    { href: "/admin/changes", label: "Timetable Changes", short: "Changes", icon: <DoorOpen className="h-5 w-5" />, context: "rooms" },
    { href: "/admin/people", label: "People & Agents", short: "People", icon: <Users className="h-5 w-5" /> },
    { href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" /> },
  ],
  // Agent who may hold a room. The role came from the bus system's account
  // table unused; on this platform it is the room-booking privilege.
  agent: [
    { href: "/agent", label: "My Bookings", short: "Bookings", icon: <CalendarCheck className="h-5 w-5" />, context: "rooms" },
    { href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" /> },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  user: "Student",
  agent: "Agent",
  admin: "Administrator",
};

function isActive(current: string, href: string) {
  return current === href;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, health, logout } = useAuth();
  const { language, theme, toggleLanguage, toggleTheme, t } = usePrefs();
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = useMemo(() => [...PUBLIC_NAV, ...(user ? ROLE_NAV[user.role] : [])], [user]);

  // On a phone the bottom bar has room for five. The public items come first,
  // and a signed-in person's own screen takes the last slot.
  const bottomItems = useMemo(() => {
    const roleFirst = user ? ROLE_NAV[user.role][0] : null;
    return roleFirst ? [...PUBLIC_NAV.slice(0, 4), roleFirst] : PUBLIC_NAV;
  }, [user]);

  const navLink = (item: NavItem, onNavigate?: () => void) => {
    const active = isActive(location, item.href);
    const activeClass = item.context === "bus" ? "nav-item-active-bus" : "nav-item-active";
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={`nav-item ${active ? activeClass : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {item.icon}
        <span>{t(item.label)}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* ---------- top bar ---------- */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-gutter">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="rounded-full p-2 text-on-surface hover:bg-surface-container-high md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary">
              <DoorOpen className="h-5 w-5" />
            </span>
            <span className="truncate text-headline-md font-bold text-primary">CampusPulse</span>
          </Link>
        </div>

        {/* The campus clock, because every status on this site is "right now". */}
        <div className="hidden flex-1 justify-center md:flex">
          <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-transparent bg-surface-container-low px-4 py-2 text-on-surface-variant">
            <Clock className="h-4 w-4" />
            <span className="truncate text-[13px]">
              {health?.campusTime ? <span className="tabular">{health.campusTime}</span> : <span>{t("Connecting…")}</span>}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            className="rounded-full border border-outline-variant px-2.5 py-1.5 text-[12px] font-bold text-on-surface hover:bg-surface-container-high"
            onClick={toggleLanguage}
            aria-label={`Switch to ${language === "en" ? LANGUAGE_NAMES.my : LANGUAGE_NAMES.en}`}
            title={`${t("Language")}: ${LANGUAGE_NAMES[language]}`}
          >
            {language === "en" ? "EN" : "မြန်"}
          </button>

          <button
            className="rounded-full p-2 text-on-surface hover:bg-surface-container-high"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("Light mode") : t("Dark mode")}
            title={theme === "dark" ? t("Light mode") : t("Dark mode")}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {user ? (
            <>
              <div className="hidden text-right sm:block">
                <p className="max-w-[160px] truncate text-[13px] font-semibold text-on-surface">{user.name ?? user.username}</p>
                <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">{t(ROLE_LABEL[user.role])}</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-highest text-[13px] font-bold text-on-surface">
                {initials(user.name ?? user.username)}
              </span>
              <button className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high" onClick={logout} aria-label="Log out" title={t("Log out")}>
                <LogOut className="h-5 w-5" />
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-ghost h-9 px-3 text-[13px]">
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">{t("Log in")}</span>
            </Link>
          )}
        </div>
      </header>

      {/* ---------- desktop side rail ---------- */}
      <aside className="fixed left-0 top-16 z-40 hidden h-[calc(100vh-64px)] w-64 flex-col border-r border-outline-variant bg-surface-container-low p-stack-md md:flex">
        <nav className="flex-1 space-y-1 overflow-y-auto kds-scroll">
          <p className="px-3 pb-1 pt-2 text-label font-semibold uppercase tracking-wider text-on-surface-variant">{t("Campus")}</p>
          {PUBLIC_NAV.map(item => navLink(item))}
          {user ? (
            <>
              <p className="px-3 pb-1 pt-4 text-label font-semibold uppercase tracking-wider text-on-surface-variant">{t(ROLE_LABEL[user.role])}</p>
              {ROLE_NAV[user.role].map(item => navLink(item))}
            </>
          ) : null}
        </nav>

        <div className="mt-auto space-y-2 border-t border-outline-variant pt-4">
          <p className="px-2 text-[11px] leading-relaxed text-on-surface-variant">
            {health ? `${t("Connected")} · ${health.timezone}` : t("Not connected — the server is not answering")}
          </p>
          {user ? (
            <button className="btn btn-ghost w-full" onClick={logout}>
              <LogOut className="h-4 w-4" /> {t("Log out")}
            </button>
          ) : (
            <Link href="/login" className="btn btn-ghost w-full">
              <ShieldCheck className="h-4 w-4" /> {t("Agent login")}
            </Link>
          )}
        </div>
      </aside>

      {/* ---------- mobile drawer ---------- */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-inverse-surface/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface-container-low p-stack-md shadow-raised">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-headline-md font-bold text-primary">CampusPulse</span>
              <button className="rounded-full p-2 hover:bg-surface-container-high" onClick={() => setDrawerOpen(false)} aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">{items.map(item => navLink(item, () => setDrawerOpen(false)))}</nav>
          </div>
        </div>
      ) : null}

      {/* ---------- page ---------- */}
      <main className="px-gutter pb-28 pt-20 md:ml-64 md:px-container-margin md:pb-10">
        <div className="mx-auto w-full max-w-6xl space-y-stack-md">{children}</div>
      </main>

      {/* ---------- mobile bottom bar ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-outline-variant bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] md:hidden">
        {bottomItems.map(item => {
          const active = isActive(location, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 px-1 py-2 text-[10px] font-semibold ${
                active ? (item.context === "bus" ? "text-tertiary" : "text-secondary") : "text-on-surface-variant"
              }`}
            >
              {item.icon}
              <span className="truncate">{t(item.short ?? item.label)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export { ROLE_LABEL };
