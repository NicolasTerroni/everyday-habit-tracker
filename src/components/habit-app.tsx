"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameMonth, parseISO, startOfMonth, startOfWeek, subDays, subMonths
} from "date-fns";
import {
  Archive, BarChart3, Bell, CalendarDays, Check, ChevronLeft, ChevronRight,
  ArrowDown, ArrowUp, Circle, Clock3, Home, LoaderCircle, Lock, LockOpen, Minus, MoreHorizontal, Plus, RotateCcw,
  Settings, Sparkles
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { isHabitComplete as isComplete, LOCK_RULE_LABELS, LOCK_RULES, lockStatus, type LockRule } from "@/lib/focus-lock";
import { Modal } from "./modal";
import type { AppData, Entry, Habit, HabitType, Reminder } from "./types";

type Tab = "today" | "calendar" | "insights" | "settings";
type User = { name: string; email: string; timezone: string; lockRule: LockRule };
type PushState = "checking" | "disconnected" | "ready" | "denied" | "unsupported" | "error";

const COLORS = ["#7565d9", "#d96b5f", "#3f8f77", "#cf8b38", "#4e7cb8", "#9a5f90"];
const ICONS = ["✨", "💧", "📚", "🏋️", "🧘", "🥗", "🌿", "✍️", "🚶", "💊", "🎸", "🇮🇹"];
const REMINDER_INTERVAL_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInTimezone(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function timestampFor(date: string) {
  const now = new Date();
  if (date === localDate()) return now.toISOString();
  return new Date(`${date}T12:00:00`).toISOString();
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || "Request failed");
  }
  return response.status === 204 ? undefined as T : response.json();
}

function rangeFor(tab: Tab, cursor: Date, selectedDate: string) {
  if (tab === "calendar") {
    return { from: localDate(startOfMonth(cursor)), to: localDate(endOfMonth(cursor)) };
  }
  if (tab === "insights") {
    return { from: localDate(subDays(new Date(), 370)), to: localDate() };
  }
  return { from: selectedDate, to: selectedDate };
}

export function HabitApp({ user: initialUser }: { user: User }) {
  const [user, setUser] = useState(initialUser);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [habitModal, setHabitModal] = useState<Habit | "new" | null>(null);
  const [entryModal, setEntryModal] = useState<Habit | null>(null);
  const [menuHabit, setMenuHabit] = useState<Habit | null>(null);
  const [reminderHabit, setReminderHabit] = useState<Habit | null>(null);
  const [offline, setOffline] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");

  const range = useMemo(() => rangeFor(tab, cursor, selectedDate), [tab, cursor, selectedDate]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<AppData>(`/api/data?from=${range.from}&to=${range.to}${tab === "settings" ? "&includeArchived=1" : ""}`);
      setData(result);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your habits");
    } finally { setLoading(false); }
  }, [range.from, range.to, tab]);

  const connectPush = useCallback(async (askPermission = true) => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setPushState("unsupported");
        return false;
      }
      if (Notification.permission === "denied") {
        setPushState("denied");
        return false;
      }
      if (Notification.permission !== "granted") {
        if (!askPermission) {
          setPushState("disconnected");
          return false;
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setPushState(permission === "denied" ? "denied" : "disconnected");
          return false;
        }
      }

      setPushState("checking");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) throw new Error("VAPID public key is not configured");
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64(publicKey) });
      }

      await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setPushState("ready");
      return true;
    } catch {
      setPushState("error");
      return false;
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);
  useEffect(() => {
    let pushTask: number | undefined;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(() => connectPush(false)).catch(() => setPushState("error"));
    } else {
      pushTask = window.setTimeout(() => void connectPush(false), 0);
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { if (pushTask !== undefined) window.clearTimeout(pushTask); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [connectPush]);

  const entriesFor = useCallback((habitId: string, date = selectedDate) =>
    (data?.entries || []).filter((entry) => entry.habitId === habitId && dateInTimezone(entry.timestamp, user.timezone) === date),
  [data?.entries, selectedDate, user.timezone]);

  async function addEntry(habit: Habit, value: number, note?: string, date = selectedDate) {
    try {
      await api("/api/entries", { method: "POST", body: JSON.stringify({ habitId: habit.id, timestamp: timestampFor(date), value, note: note || null }) });
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save entry");
      return false;
    }
  }

  async function removeEntry(id: string) {
    try { await api(`/api/entries/${id}`, { method: "DELETE" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove entry"); }
  }

  async function toggleBoolean(habit: Habit, date = selectedDate) {
    const existing = entriesFor(habit.id, date)[0];
    if (existing) await removeEntry(existing.id); else await addEntry(habit, 1, undefined, date);
  }

  function openDay(date: string) {
    setSelectedDate(date); setTab("today");
  }

  function openCalendar(date: string) {
    setSelectedDate(date); setCursor(startOfMonth(parseISO(date))); setTab("calendar");
  }

  const displayDate = parseISO(selectedDate);
  const isToday = selectedDate === localDate();
  const activeHabits = (data?.habits || []).filter((habit) => {
    if (isToday) return habit.active;
    return habit.active || Boolean(habit.archivedAt && selectedDate <= dateInTimezone(habit.archivedAt, user.timezone));
  });

  return (
    <main className="app-frame">
      <div className="desktop-rail">
        <div className="brand"><span className="brand-mark"><Check size={16} /></span> everyday</div>
        <nav>{navItems.map((item) => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => setTab(item.id)} />)}</nav>
        <div className="rail-user"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
      </div>

      <section className="app-content">
        {offline && <div className="offline-banner">You’re offline. Saved history is still available; changes need a connection.</div>}
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}

        {tab === "today" && <>
          <PageHeader eyebrow={isToday ? "TODAY" : format(displayDate, "EEEE")} title={isToday ? `Good ${greeting()}, ${user.name.split(" ")[0]}` : format(displayDate, "MMMM d, yyyy")} subtitle={isToday ? format(displayDate, "EEEE, MMMM d") : "Historical entries can be edited."}>
            <button className="date-step" onClick={() => setSelectedDate(localDate(addDays(displayDate, -1)))}><ChevronLeft size={18} /></button>
            {!isToday && <button className="text-button" onClick={() => setSelectedDate(localDate())}>Today</button>}
            <button className="date-step" disabled={isToday} onClick={() => setSelectedDate(localDate(addDays(displayDate, 1)))}><ChevronRight size={18} /></button>
          </PageHeader>
          <TodayView loading={loading} habits={activeHabits} lockRule={isToday ? user.lockRule : "off"} entriesFor={entriesFor} onToggle={toggleBoolean} onAdd={(habit) => setEntryModal(habit)} onMenu={setMenuHabit} />
          <button className="fab" onClick={() => setHabitModal("new")} aria-label="Create habit"><Plus size={24} /></button>
        </>}

        {tab === "calendar" && <CalendarView loading={loading} data={data} cursor={cursor} selectedDate={selectedDate} timezone={user.timezone} onCursor={setCursor} onDay={openDay} />}
        {tab === "insights" && <InsightsView loading={loading} data={data} timezone={user.timezone} onDay={openCalendar} />}
        {tab === "settings" && <SettingsView user={user} habits={data?.habits || []} loading={loading} pushState={pushState} onConnectPush={() => connectPush(true)} onUser={setUser} onChanged={load} />}
      </section>

      <nav className="bottom-nav">{navItems.map((item) => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => setTab(item.id)} />)}</nav>

      {habitModal && <HabitEditor habit={habitModal === "new" ? null : habitModal} onClose={() => setHabitModal(null)} onSaved={async () => { setHabitModal(null); await load(); }} />}
      {entryModal && <EntryEditor habit={entryModal} entries={entriesFor(entryModal.id)} onClose={() => setEntryModal(null)} onAdd={(value, note) => addEntry(entryModal, value, note)} onRemove={removeEntry} />}
      {menuHabit && <HabitMenu habit={menuHabit} entries={entriesFor(menuHabit.id)} onClose={() => setMenuHabit(null)} onEdit={() => { setHabitModal(menuHabit); setMenuHabit(null); }} onEntry={() => { setEntryModal(menuHabit); setMenuHabit(null); }} onReminder={() => { setReminderHabit(menuHabit); setMenuHabit(null); }} onChanged={load} />}
      {reminderHabit && <ReminderEditor habit={reminderHabit} reminder={(data?.reminders || []).find((item) => item.habitId === reminderHabit.id)} pushState={pushState} onConnectPush={() => connectPush(true)} onClose={() => setReminderHabit(null)} onSaved={async () => { setReminderHabit(null); await load(); }} />}
    </main>
  );
}

const navItems: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "today", label: "Today", icon: Home },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings }
];

function NavButton({ item, active, onClick }: { item: typeof navItems[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={active ? "active" : ""} onClick={onClick}><Icon size={20} strokeWidth={active ? 2.3 : 1.8} /><span>{item.label}</span></button>;
}

function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{subtitle}</p></div>{children && <div className="header-actions">{children}</div>}</header>;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

function TodayView({ loading, habits, lockRule, entriesFor, onToggle, onAdd, onMenu }: {
  loading: boolean; habits: Habit[]; lockRule: LockRule; entriesFor: (id: string) => Entry[];
  onToggle: (habit: Habit) => void; onAdd: (habit: Habit) => void; onMenu: (habit: Habit) => void;
}) {
  if (loading) return <Loading />;
  if (!habits.length) return <EmptyState icon={<Sparkles />} title="A blank page" text="Create your first habit and begin a record that belongs only to you." />;
  const complete = habits.filter((habit) => isComplete(habit, entriesFor(habit.id))).length;
  const lock = lockRule === "off" ? null : lockStatus(lockRule, habits, habits.flatMap((habit) => entriesFor(habit.id)));
  return <div className="today-wrap">
    {lock && <div className={`lock-banner ${lock.locked ? "" : "unlocked"}`}>{lock.locked ? <Lock size={17} /> : <LockOpen size={17} />}<span><strong>{lock.locked ? "Apps locked" : "Apps unlocked"}</strong><small>{lock.locked ? lock.message.replace("Locked: ", "To unlock, ") : "You've earned your free time today"}</small></span></div>}
    <div className="day-progress"><div><span>{complete}</span> of {habits.length} complete</div><div className="progress-track"><i style={{ width: `${habits.length ? complete / habits.length * 100 : 0}%` }} /></div></div>
    <div className="habit-list">{habits.map((habit) => <HabitCard key={habit.id} habit={habit} entries={entriesFor(habit.id)} onToggle={() => onToggle(habit)} onAdd={() => onAdd(habit)} onMenu={() => onMenu(habit)} />)}</div>
  </div>;
}

function HabitCard({ habit, entries, onToggle, onAdd, onMenu }: { habit: Habit; entries: Entry[]; onToggle: () => void; onAdd: () => void; onMenu: () => void }) {
  const total = entries.reduce((sum, item) => sum + Number(item.value), 0);
  const completed = isComplete(habit, entries);
  const percent = habit.type === "boolean" ? (completed ? 100 : 0) : Math.min(100, total / Number(habit.targetValue || 1) * 100);
  return <article className={`habit-card ${completed ? "complete" : ""}`} style={{ "--habit": habit.color } as React.CSSProperties}>
    <button className="habit-main" onClick={habit.type === "boolean" ? onToggle : onAdd}>
      <span className="habit-icon">{habit.icon}</span>
      <span className="habit-copy"><strong>{habit.name}{habit.nonNegotiable && <Lock className="non-negotiable-mark" size={12} aria-label="Non-negotiable" />}</strong><small>{habit.type === "boolean" ? (completed ? "Completed" : "Not completed") : `${pretty(total)} / ${pretty(Number(habit.targetValue))} ${habit.unit}`}</small>{habit.type !== "boolean" && <i><b style={{ width: `${percent}%` }} /></i>}</span>
      {habit.type === "boolean" ? <span className={`check-control ${completed ? "checked" : ""}`}>{completed ? <Check size={18} /> : <Circle size={21} />}</span> : <span className="add-control"><Plus size={19} /></span>}
    </button>
    <button className="more-button" aria-label={`More actions for ${habit.name}`} onClick={onMenu}><MoreHorizontal size={20} /></button>
  </article>;
}

function pretty(value: number) { return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 2 }); }

function Loading() { return <div className="loading"><LoaderCircle className="spin" /><span>Opening your record…</span></div>; }
function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{text}</p></div>; }

function CalendarView({ loading, data, cursor, selectedDate, timezone, onCursor, onDay }: {
  loading: boolean; data: AppData | null; cursor: Date; selectedDate: string; timezone: string; onCursor: (date: Date) => void; onDay: (date: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"month" | "year">("month");
  const [yearResult, setYearResult] = useState<{ year: number; data: AppData } | null>(null);
  useEffect(() => {
    if (mode !== "year") return;
    const year = cursor.getFullYear();
    void api<AppData>(`/api/data?from=${year}-01-01&to=${year}-12-31`).then((result) => setYearResult({ year, data: result }));
  }, [mode, cursor]);
  const calendarData = mode === "year" && yearResult?.year === cursor.getFullYear() ? yearResult.data : data;
  const activeIds = selected.length ? selected : (calendarData?.habits || []).map((habit) => habit.id);
  const gridDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) });

  function completionFor(date: string) {
    const eligible = (calendarData?.habits || []).filter((habit) => activeIds.includes(habit.id) && date >= dateInTimezone(habit.createdAt, timezone) && (!habit.archivedAt || date <= dateInTimezone(habit.archivedAt, timezone)));
    if (!eligible.length) return null;
    const completed = eligible.filter((habit) => isComplete(habit, (calendarData?.entries || []).filter((entry) => entry.habitId === habit.id && dateInTimezone(entry.timestamp, timezone) === date))).length;
    return completed / eligible.length;
  }

  return <>
    <PageHeader eyebrow="HISTORY" title="Your calendar" subtitle="The shape of your days, without judgment.">
      <button className="date-step" onClick={() => onCursor(mode === "month" ? subMonths(cursor, 1) : new Date(cursor.getFullYear() - 1, 0, 1))}><ChevronLeft size={18} /></button>
      <button className="date-step" onClick={() => onCursor(mode === "month" ? addMonths(cursor, 1) : new Date(cursor.getFullYear() + 1, 0, 1))}><ChevronRight size={18} /></button>
    </PageHeader>
    <div className="segmented"><button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>Month</button><button className={mode === "year" ? "active" : ""} onClick={() => setMode("year")}>Year</button></div>
    {loading || (mode === "year" && yearResult?.year !== cursor.getFullYear()) ? <Loading /> : !calendarData?.habits.length ? <EmptyState icon={<CalendarDays />} title="Nothing here yet" text="Your history will appear after you create a habit." /> : <>
      <div className="filter-row">{calendarData.habits.map((habit) => {
        const chosen = !selected.length || selected.includes(habit.id);
        return <button key={habit.id} className={chosen ? "chosen" : ""} onClick={() => setSelected((current) => current.includes(habit.id) ? current.filter((id) => id !== habit.id) : [...current, habit.id])}><span style={{ background: habit.color }} />{habit.name}</button>;
      })}</div>
      {mode === "month" ? <section className="calendar-card">
        <header><h2>{format(cursor, "MMMM yyyy")}</h2><p>Tap a day to review or edit</p></header>
        <div className="week-labels">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
        <div className="month-grid">{gridDays.map((day) => {
          const key = localDate(day); const ratio = completionFor(key); const future = key > localDate();
          return <button key={key} disabled={future} className={`${!isSameMonth(day, cursor) ? "outside" : ""} ${key === localDate() ? "today" : ""} ${key === selectedDate ? "selected" : ""}`} onClick={() => onDay(key)}><span>{format(day, "d")}</span>{ratio !== null && !future && <i className={ratio === 1 ? "full" : ""} style={{ "--ratio": ratio } as React.CSSProperties} />}</button>;
        })}</div>
        <footer><span><i className="legend empty" /> Not done</span><span><i className="legend partial" /> Some</span><span><i className="legend full" /> Complete</span></footer>
      </section> : <section className="year-card"><h2>{cursor.getFullYear()}</h2><div className="year-grid">{Array.from({ length: 12 }, (_, month) => {
        const monthDate = new Date(cursor.getFullYear(), month, 1);
        const days = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) }).filter((day) => localDate(day) <= localDate());
        const values = days.map((day) => completionFor(localDate(day))).filter((value): value is number => value !== null);
        const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        return <button key={month} onClick={() => { onCursor(monthDate); setMode("month"); }}><span>{format(monthDate, "MMM")}</span><div>{Array.from({ length: 12 }, (_, i) => <i key={i} className={i / 12 < average ? "filled" : ""} />)}</div><small>{Math.round(average * 100)}%</small></button>;
      })}</div></section>}
    </>}
  </>;
}

function InsightsView({ loading, data, timezone, onDay }: { loading: boolean; data: AppData | null; timezone: string; onDay: (date: string) => void }) {
  const days = useMemo(() => eachDayOfInterval({ start: subDays(new Date(), 89), end: new Date() }), []);
  const heatmapStart = useMemo(() => subDays(new Date(), 364), []);
  const heatmapDays = useMemo(() => eachDayOfInterval({ start: startOfWeek(heatmapStart, { weekStartsOn: 1 }), end: new Date() }), [heatmapStart]);
  const heatmapScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = heatmapScroll.current;
    if (!scroller) return;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data?.from, data?.to]);
  if (loading) return <><PageHeader eyebrow="PATTERNS" title="Your insights" subtitle="Description, not judgment." /><Loading /></>;
  if (!data?.habits.length) return <><PageHeader eyebrow="PATTERNS" title="Your insights" subtitle="Description, not judgment." /><EmptyState icon={<BarChart3 />} title="Patterns take time" text="Once you have a few entries, useful patterns will live here." /></>;

  const eligibleFor = (habit: Habit, day: Date) => {
    const date = localDate(day);
    return date >= dateInTimezone(habit.createdAt, timezone) && (!habit.archivedAt || date <= dateInTimezone(habit.archivedAt, timezone));
  };
  const entriesByHabitDay = new Map<string, Entry[]>();
  for (const entry of data.entries) {
    const key = `${entry.habitId}:${dateInTimezone(entry.timestamp, timezone)}`;
    entriesByHabitDay.set(key, [...(entriesByHabitDay.get(key) || []), entry]);
  }
  const entriesOn = (habit: Habit, date: string) => entriesByHabitDay.get(`${habit.id}:${date}`) || [];
  const heatmapStartKey = localDate(heatmapStart);
  const heatmap = heatmapDays.map((day) => {
    const date = localDate(day);
    if (date < heatmapStartKey) return { day, date, eligible: 0, complete: 0, ratio: null };
    const eligible = data.habits.filter((habit) => eligibleFor(habit, day));
    const complete = eligible.filter((habit) => isComplete(habit, entriesOn(habit, date))).length;
    return { day, date, eligible: eligible.length, complete, ratio: eligible.length ? complete / eligible.length : null };
  });
  const heatmapWeeks = Array.from({ length: Math.ceil(heatmap.length / 7) }, (_, index) => heatmap.slice(index * 7, index * 7 + 7));
  const measuredDays = heatmap.filter((day) => day.date >= heatmapStartKey && day.ratio !== null);
  const disciplinedDays = measuredDays.filter((day) => day.ratio === 1).length;
  const yearlyAverage = measuredDays.length ? measuredDays.reduce((sum, day) => sum + (day.ratio || 0), 0) / measuredDays.length : 0;
  const metrics = data.habits.map((habit) => {
    const eligible = days.filter((day) => eligibleFor(habit, day));
    const complete = eligible.filter((day) => isComplete(habit, entriesOn(habit, localDate(day))));
    const total = days.flatMap((day) => entriesOn(habit, localDate(day))).reduce((sum, entry) => sum + Number(entry.value), 0);
    return { habit, eligible: eligible.length, complete: complete.length, rate: eligible.length ? complete.length / eligible.length : 0, average: eligible.length ? total / eligible.length : 0 };
  });
  const overall = metrics.reduce((sum, metric) => sum + metric.complete, 0) / Math.max(1, metrics.reduce((sum, metric) => sum + metric.eligible, 0));
  const weekdays = Array.from({ length: 7 }, (_, weekday) => {
    const matching = days.filter((day) => (day.getDay() + 6) % 7 === weekday);
    let possible = 0; let complete = 0;
    for (const day of matching) for (const habit of data.habits) if (eligibleFor(habit, day)) {
      possible++; if (isComplete(habit, entriesOn(habit, localDate(day)))) complete++;
    }
    return possible ? complete / possible : 0;
  });

  return <>
    <PageHeader eyebrow="PATTERNS" title="Your insights" subtitle="Look for patterns, not perfection." />
    <section className="insight-card discipline-card">
      <header><div><p className="eyebrow">LAST 365 DAYS</p><h2>Your discipline over time</h2></div><div className="discipline-summary"><strong>{disciplinedDays}</strong><span>fully completed days</span><small>{Math.round(yearlyAverage * 100)}% average completion</small></div></header>
      <div className="discipline-scroll" ref={heatmapScroll}><div className="discipline-map">
        <div className="discipline-months">{heatmapWeeks.map((week, index) => {
          const firstVisible = week.find((item) => item.date >= heatmapStartKey);
          const monthStart = week.find((item) => item.date >= heatmapStartKey && item.day.getDate() === 1);
          return <span key={index}>{monthStart ? format(monthStart.day, "MMM") : index === 0 && firstVisible ? format(firstVisible.day, "MMM") : ""}</span>;
        })}</div>
        <div className="discipline-layout"><div className="discipline-weekdays">{["M", "", "W", "", "F", "", ""].map((label, index) => <span key={index}>{label}</span>)}</div><div className="discipline-grid">{heatmap.map((item) => {
          const level = item.ratio === null ? "none" : item.ratio === 0 ? "level-0" : item.ratio <= .25 ? "level-1" : item.ratio <= .5 ? "level-2" : item.ratio < 1 ? "level-3" : "level-4";
          const label = item.ratio === null ? `${format(item.day, "MMMM d, yyyy")}: no active habits` : `${format(item.day, "MMMM d, yyyy")}: ${item.complete} of ${item.eligible} habits completed (${Math.round(item.ratio * 100)}%)`;
          return <button key={item.date} type="button" className={`${level} ${item.date === localDate() ? "today" : ""}`} disabled={item.ratio === null} title={label} aria-label={label} onClick={() => onDay(item.date)} />;
        })}</div></div>
      </div></div>
      <footer className="discipline-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`level-${level}`} />)}<span>More</span></footer>
    </section>
    <div className="insight-hero"><div className="ring" style={{ "--percent": overall * 100 } as React.CSSProperties}><span>{Math.round(overall * 100)}<small>%</small></span></div><div><p className="eyebrow">LAST 90 DAYS</p><h2>{overall >= .8 ? "A steady rhythm." : overall >= .5 ? "A rhythm is forming." : "Every entry counts."}</h2><p>Across days when each habit existed.</p></div></div>
    <section className="insight-card"><header><div><p className="eyebrow">BY HABIT</p><h2>How each habit is going</h2></div></header><div className="metric-list">{metrics.map(({ habit, complete, eligible, rate, average }) => <div key={habit.id}><span className="habit-icon small">{habit.icon}</span><div><strong>{habit.name}</strong><i><b style={{ width: `${rate * 100}%`, background: habit.color }} /></i></div><span>{habit.type === "boolean" ? `${complete}/${eligible}` : `${pretty(average)} ${habit.unit}/day`}<small>{Math.round(rate * 100)}%</small></span></div>)}</div></section>
    <section className="insight-card"><header><div><p className="eyebrow">BY WEEKDAY</p><h2>Your weekly rhythm</h2></div></header><div className="weekday-chart">{weekdays.map((value, index) => <div key={index}><span>{Math.round(value * 100)}%</span><i><b style={{ height: `${Math.max(4, value * 100)}%` }} /></i><small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small></div>)}</div></section>
  </>;
}

function HabitEditor({ habit, onClose, onSaved }: { habit: Habit | null; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<HabitType>(habit?.type || "boolean");
  const [color, setColor] = useState(habit?.color || COLORS[0]);
  const [icon, setIcon] = useState(habit?.icon || ICONS[0]);
  const [nonNegotiable, setNonNegotiable] = useState(habit?.nonNegotiable || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"), description: form.get("description") || null, type,
      targetValue: type === "boolean" ? null : Number(form.get("targetValue")),
      unit: type === "boolean" ? null : form.get("unit"), icon, color, nonNegotiable
    };
    try { await api(habit ? `/api/habits/${habit.id}` : "/api/habits", { method: habit ? "PATCH" : "POST", body: JSON.stringify(body) }); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save habit"); setBusy(false); }
  }

  return <Modal title={habit ? "Edit habit" : "Create a habit"} eyebrow={habit ? "MAKE A CHANGE" : "A NEW PRACTICE"} onClose={onClose}>
    <form className="form-stack editor-form" onSubmit={submit}>
      <label>Name<input name="name" defaultValue={habit?.name} required maxLength={80} autoFocus placeholder="e.g. Read, drink water, meditate" /></label>
      <label>Description <span className="optional">optional</span><textarea name="description" defaultValue={habit?.description || ""} maxLength={500} placeholder="What does this habit mean to you?" /></label>
      <fieldset><legend>Type</legend><div className="type-grid">{([
        ["boolean", Check, "Done or not"], ["quantity", Plus, "Add amounts"], ["duration", Clock3, "Track minutes"], ["count", BarChart3, "Count times"]
      ] as const).map(([value, Icon, caption]) => <button type="button" key={value} className={type === value ? "selected" : ""} onClick={() => setType(value)}><Icon size={18} /><strong>{value[0].toUpperCase() + value.slice(1)}</strong><small>{caption}</small></button>)}</div></fieldset>
      {type !== "boolean" && <div className="split-fields"><label>Daily target<input name="targetValue" type="number" min="0.001" step="any" required defaultValue={habit?.targetValue || (type === "duration" ? 30 : type === "count" ? 1 : 2000)} /></label><label>Unit<input name="unit" required maxLength={24} defaultValue={habit?.unit || (type === "duration" ? "min" : type === "count" ? "times" : "ml")} /></label></div>}
      <fieldset><legend>Icon</legend><div className="icon-picker">{ICONS.map((value) => <button type="button" aria-label={`Use ${value}`} key={value} className={icon === value ? "selected" : ""} onClick={() => setIcon(value)}>{value}</button>)}</div><label className="custom-emoji">Any emoji<input value={icon} onChange={(event) => setIcon(event.target.value)} required maxLength={64} placeholder="Type or paste an emoji" /></label></fieldset>
      <fieldset><legend>Color</legend><div className="color-picker">{COLORS.map((value) => <button type="button" aria-label={value} key={value} className={color === value ? "selected" : ""} style={{ background: value }} onClick={() => setColor(value)}>{color === value && <Check size={14} />}</button>)}</div></fieldset>
      <label className="toggle-row"><span><strong>Non-negotiable</strong><small>Must be done before your apps unlock</small></span><input type="checkbox" checked={nonNegotiable} onChange={(event) => setNonNegotiable(event.target.checked)} /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? "Saving…" : habit ? "Save changes" : "Create habit"}</button>
    </form>
  </Modal>;
}

function EntryEditor({ habit, entries, onClose, onAdd, onRemove }: { habit: Habit; entries: Entry[]; onClose: () => void; onAdd: (value: number, note?: string) => Promise<boolean>; onRemove: (id: string) => void }) {
  const suggested = habit.type === "duration" ? [10, 20, 30] : habit.type === "count" ? [1, 2, 5] : [250, 500, 750];
  const [value, setValue] = useState(suggested[0]);
  const [busy, setBusy] = useState(false);
  if (habit.type === "boolean") {
    return <Modal title={`Note for ${habit.name}`} eyebrow="KEEP THE CONTEXT" onClose={onClose}>
      <form className="form-stack editor-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); if (await onAdd(1, String(form.get("note") || ""))) onClose(); else setBusy(false); }}>
        <label>Note<textarea name="note" required maxLength={1000} defaultValue={entries[0]?.note || ""} placeholder="What would you like to remember?" /></label>
        {!entries.length && <p className="helper-text">Saving this note will also mark the habit complete for this day.</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save note"}</button>
      </form>
    </Modal>;
  }
  const total = entries.reduce((sum, entry) => sum + Number(entry.value), 0);
  return <Modal title={habit.name} eyebrow="RECORD PROGRESS" onClose={onClose}>
    <div className="entry-summary"><span className="habit-icon large">{habit.icon}</span><div><strong>{pretty(total)} / {pretty(Number(habit.targetValue))} {habit.unit}</strong><div className="progress-track"><i style={{ width: `${Math.min(100, total / Number(habit.targetValue || 1) * 100)}%`, background: habit.color }} /></div></div></div>
    <form className="form-stack editor-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); if (await onAdd(value, String(form.get("note") || ""))) onClose(); else setBusy(false); }}>
      <fieldset><legend>Quick add</legend><div className="quick-values">{suggested.map((amount) => <button type="button" key={amount} className={value === amount ? "selected" : ""} onClick={() => setValue(amount)}>+{amount} <small>{habit.unit}</small></button>)}</div></fieldset>
      <label>Custom amount<input type="number" min="0.001" step="any" value={value} onChange={(event) => setValue(Number(event.target.value))} required /></label>
      <label>Note <span className="optional">optional</span><textarea name="note" maxLength={1000} placeholder="Anything worth remembering?" /></label>
      <button className="primary-button" disabled={busy}><Plus size={17} /> {busy ? "Saving…" : `Add ${pretty(value)} ${habit.unit}`}</button>
    </form>
    {!!entries.length && <div className="entries-list"><p className="eyebrow">TODAY&apos;S ENTRIES</p>{entries.map((entry) => <div key={entry.id}><span><strong>+{pretty(Number(entry.value))} {habit.unit}</strong><small>{new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{entry.note ? ` · ${entry.note}` : ""}</small></span><button aria-label="Remove entry" onClick={() => onRemove(entry.id)}><Minus size={16} /></button></div>)}</div>}
  </Modal>;
}

function HabitMenu({ habit, entries, onClose, onEdit, onEntry, onReminder, onChanged }: { habit: Habit; entries: Entry[]; onClose: () => void; onEdit: () => void; onEntry: () => void; onReminder: () => void; onChanged: () => void }) {
  const noteEntry = entries.find((entry) => entry.note);
  async function archive() {
    await api(`/api/habits/${habit.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) }); onClose(); onChanged();
  }
  return <Modal title={habit.name} eyebrow="HABIT OPTIONS" onClose={onClose}>
    <div className="action-list">
      <button onClick={onEdit}><span><Settings size={19} /></span><div><strong>Edit habit</strong><small>Name, target, icon and color</small></div><ChevronRight size={18} /></button>
      <button onClick={onEntry}><span><Plus size={19} /></span><div><strong>{habit.type === "boolean" ? "Add a note" : "Add progress or note"}</strong><small>{noteEntry ? `Latest: ${noteEntry.note}` : "Keep context with each entry"}</small></div><ChevronRight size={18} /></button>
      <button onClick={onReminder}><span><Bell size={19} /></span><div><strong>Reminder settings</strong><small>Only remind me when incomplete</small></div><ChevronRight size={18} /></button>
      <button className="danger" onClick={archive}><span><Archive size={19} /></span><div><strong>Archive habit</strong><small>History will be preserved</small></div><ChevronRight size={18} /></button>
    </div>
  </Modal>;
}

function ReminderEditor({ habit, reminder, pushState, onConnectPush, onClose, onSaved }: { habit: Habit; reminder?: Reminder; pushState: PushState; onConnectPush: () => Promise<boolean>; onClose: () => void; onSaved: () => void }) {
  const [repeat, setRepeat] = useState(Boolean(reminder?.intervalMinutes));
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = { habitId: habit.id, enabled: true, startTime: form.get("startTime"), endTime: repeat ? form.get("endTime") : null, intervalMinutes: repeat ? Number(form.get("intervalMinutes")) : null };
    await api(reminder ? `/api/reminders/${reminder.id}` : "/api/reminders", { method: reminder ? "PATCH" : "POST", body: JSON.stringify(body) });
    onSaved();
  }

  return <Modal title={`Remind me about ${habit.name}`} eyebrow="WHEN IT'S STILL INCOMPLETE" onClose={onClose}>
    {pushState !== "ready" && pushState !== "checking" && <div className="push-callout"><Bell size={20} /><div><strong>Enable notifications once</strong><p>{pushState === "denied" ? "Notifications are blocked in this browser. Allow them in the site settings, then try again." : pushState === "unsupported" ? "On iPhone, install Everyday to your Home Screen before enabling notifications." : "This device will stay connected for every habit reminder."}</p></div><button type="button" disabled={pushState === "denied" || pushState === "unsupported"} onClick={() => void onConnectPush()}>{pushState === "error" ? "Try again" : pushState === "denied" ? "Blocked" : pushState === "unsupported" ? "Unavailable" : "Enable"}</button></div>}
    <form className="form-stack editor-form" onSubmit={submit}>
      <label>First reminder<input type="time" name="startTime" required defaultValue={reminder?.startTime || "20:00"} /></label>
      <label className="toggle-row"><span><strong>Repeat during the day</strong><small>Stops as soon as the target is reached</small></span><input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /></label>
      {repeat && <div className="split-fields"><label>Until<input type="time" name="endTime" required defaultValue={reminder?.endTime || "21:00"} /></label><label>Every<select name="intervalMinutes" defaultValue={reminder?.intervalMinutes || 180}>{REMINDER_INTERVAL_HOURS.map((hours) => <option key={hours} value={hours * 60}>{hours} {hours === 1 ? "hour" : "hours"}</option>)}</select></label></div>}
      <p className="helper-text">A reminder is recorded once per scheduled slot, so retries can never create duplicates.</p>
      <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save reminder"}</button>
      {reminder && <button type="button" className="danger-button" onClick={async () => { await api(`/api/reminders/${reminder.id}`, { method: "DELETE" }); onSaved(); }}>Delete reminder</button>}
    </form>
  </Modal>;
}

function urlBase64(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64); return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function SettingsView({ user, habits, loading, pushState, onConnectPush, onUser, onChanged }: { user: User; habits: Habit[]; loading: boolean; pushState: PushState; onConnectPush: () => Promise<boolean>; onUser: (user: User) => void; onChanged: () => void }) {
  const [dark, setDark] = useState(false);
  const [message, setMessage] = useState("");
  const archived = habits.filter((habit) => !habit.active);
  const active = habits.filter((habit) => habit.active).sort((a, b) => a.sortOrder - b.sortOrder);
  useEffect(() => {
    const enabled = localStorage.getItem("everyday-theme") === "dark";
    const task = window.setTimeout(() => setDark(enabled), 0);
    document.documentElement.dataset.theme = enabled ? "dark" : "light";
    return () => window.clearTimeout(task);
  }, []);

  async function updateTimezone(timezone: string) {
    await api("/api/profile", { method: "PATCH", body: JSON.stringify({ timezone }) });
    onUser({ ...user, timezone }); setMessage("Timezone updated");
  }

  async function updateLockRule(lockRule: LockRule) {
    await api("/api/profile", { method: "PATCH", body: JSON.stringify({ lockRule }) });
    onUser({ ...user, lockRule }); setMessage(lockRule === "off" ? "Focus lock turned off" : "Focus lock updated");
  }

  async function testPush() {
    try { const result = await api<{ sent: number }>("/api/push/test", { method: "POST" }); setMessage(result.sent ? "Test notification sent" : "Connect notifications in Settings first"); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Test failed"); }
  }

  async function setupNotifications() {
    if (await onConnectPush()) setMessage("Notifications connected for every reminder on this device");
  }

  const notificationStatus = pushState === "ready" ? "Connected once for every reminder on this device"
    : pushState === "checking" ? "Checking this device…"
    : pushState === "denied" ? "Blocked by the browser; allow notifications in site settings"
    : pushState === "unsupported" ? "Install the app to your Home Screen on iPhone first"
    : pushState === "error" ? "Could not connect; tap to try again"
    : "Enable once for every habit reminder";

  function toggleTheme() {
    const value = !dark; setDark(value); localStorage.setItem("everyday-theme", value ? "dark" : "light"); document.documentElement.dataset.theme = value ? "dark" : "light";
  }

  async function moveHabit(index: number, direction: -1 | 1) {
    const otherIndex = index + direction;
    if (!active[otherIndex]) return;
    const current = active[index];
    const other = active[otherIndex];
    await Promise.all([
      api(`/api/habits/${current.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: other.sortOrder }) }),
      api(`/api/habits/${other.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: current.sortOrder }) })
    ]);
    onChanged();
  }

  return <>
    <PageHeader eyebrow="YOUR SPACE" title="Settings" subtitle="A few thoughtful controls." />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}>×</button></div>}
    <section className="settings-card profile-card"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><h2>{user.name}</h2><p>{user.email}</p></div></section>
    <section className="settings-card"><p className="eyebrow">PREFERENCES</p>
      <label className="settings-row"><span><strong>Timezone</strong><small>Controls “today” and reminder times</small></span><select value={user.timezone} onChange={(event) => void updateTimezone(event.target.value)}>{timezoneOptions(user.timezone).map((zone) => <option key={zone}>{zone}</option>)}</select></label>
      <label className="settings-row"><span><strong>Dark appearance</strong><small>Easy on the eyes at night</small></span><input type="checkbox" checked={dark} onChange={toggleTheme} /></label>
      <button className={`settings-row ${pushState === "ready" ? "notification-ready" : ""}`} disabled={pushState === "checking" || pushState === "ready" || pushState === "unsupported"} onClick={() => void setupNotifications()}><span><strong>Notifications</strong><small>{notificationStatus}</small></span>{pushState === "checking" ? <LoaderCircle className="spin" size={19} /> : pushState === "ready" ? <Check size={19} /> : <Bell size={19} />}</button>
      <button className="settings-row" onClick={testPush}><span><strong>Test notifications</strong><small>Send a push to connected devices</small></span><Bell size={19} /></button>
    </section>
    <section className="settings-card"><p className="eyebrow">FOCUS LOCK</p>
      <label className="settings-row"><span><strong>Unlock apps after</strong><small>Your iPhone Shortcut asks this before opening a locked app</small></span><select value={user.lockRule} onChange={(event) => void updateLockRule(event.target.value as LockRule)}>{LOCK_RULES.map((rule) => <option key={rule} value={rule}>{LOCK_RULE_LABELS[rule]}</option>)}</select></label>
      {user.lockRule !== "off" && user.lockRule !== "half" && !active.some((habit) => habit.nonNegotiable) && <p className="muted settings-empty">No habit is marked non-negotiable yet. Edit a habit and turn on <strong>Non-negotiable</strong>.</p>}
    </section>
    <section className="settings-card"><p className="eyebrow">HABIT ORDER</p>
      {active.map((habit, index) => <div className="archive-row" key={habit.id}><span className="habit-icon small">{habit.icon}</span><div><strong>{habit.name}</strong><small>Position {index + 1}</small></div><span className="order-buttons"><button disabled={index === 0} aria-label={`Move ${habit.name} up`} onClick={() => void moveHabit(index, -1)}><ArrowUp size={15} /></button><button disabled={index === active.length - 1} aria-label={`Move ${habit.name} down`} onClick={() => void moveHabit(index, 1)}><ArrowDown size={15} /></button></span></div>)}
    </section>
    <section className="settings-card"><p className="eyebrow">ARCHIVE</p>
      {loading ? <LoaderCircle className="spin" /> : !archived.length ? <p className="muted settings-empty">Archived habits will appear here. Their history is never deleted.</p> : archived.map((habit) => <div className="archive-row" key={habit.id}><span className="habit-icon small">{habit.icon}</span><div><strong>{habit.name}</strong><small>History preserved</small></div><button onClick={async () => { await api(`/api/habits/${habit.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) }); onChanged(); }}><RotateCcw size={16} /> Restore</button></div>)}
    </section>
    <section className="settings-card"><p className="eyebrow">ACCOUNT</p><button className="settings-row danger-text" onClick={async () => { await authClient.signOut(); window.location.reload(); }}><span><strong>Sign out</strong><small>Your data remains safely stored</small></span><ChevronRight size={18} /></button></section>
    <p className="settings-foot">Everyday v1 · No ads, streaks, or gamification.</p>
  </>;
}

function timezoneOptions(current: string) {
  const common = [current, "Europe/Rome", "Europe/Madrid", "Europe/London", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Mexico_City", "America/Argentina/Buenos_Aires", "Asia/Tokyo", "Australia/Sydney"];
  return [...new Set(common)];
}
