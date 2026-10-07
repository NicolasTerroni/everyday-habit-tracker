// Shared by the app and the integration route, so it must stay free of server-only imports.

export const LOCK_RULES = ["off", "half", "nonNegotiables", "either", "both"] as const;
export type LockRule = typeof LOCK_RULES[number];

export const LOCK_RULE_LABELS: Record<LockRule, string> = {
  off: "Off",
  half: "Half of today's habits",
  nonNegotiables: "All non-negotiables",
  either: "Non-negotiables or half",
  both: "Non-negotiables and half"
};

type HabitLike = { id: string; name: string; type: string; targetValue: string | null; nonNegotiable: boolean };
type EntryLike = { habitId: string; value: string };

export function isHabitComplete(habit: Pick<HabitLike, "type" | "targetValue">, entries: EntryLike[]) {
  if (habit.type === "boolean") return entries.length > 0;
  return entries.reduce((sum, entry) => sum + Number(entry.value), 0) >= Number(habit.targetValue || 0);
}

export function asLockRule(value: unknown): LockRule {
  return LOCK_RULES.includes(value as LockRule) ? value as LockRule : "off";
}

// Whether distracting apps stay locked, given today's active habits and only today's entries.
// "Half" rounds up (3 of 5). With no habit marked non-negotiable, that condition counts as met.
export function lockStatus(rule: LockRule, habits: HabitLike[], entries: EntryLike[]) {
  const done = new Set(habits.filter((habit) => isHabitComplete(habit, entries.filter((entry) => entry.habitId === habit.id))).map((habit) => habit.id));
  const halfNeeded = Math.ceil(habits.length / 2);
  const halfMet = done.size >= halfNeeded;
  const required = habits.filter((habit) => habit.nonNegotiable);
  const missing = required.filter((habit) => !done.has(habit.id)).map((habit) => habit.name);
  const requiredMet = missing.length === 0;

  const unlocked = rule === "off" ? true
    : rule === "half" ? halfMet
    : rule === "nonNegotiables" ? requiredMet
    : rule === "either" ? halfMet || requiredMet
    : halfMet && requiredMet;

  const halfLeft = Math.max(0, halfNeeded - done.size);
  const todo = [
    (rule === "nonNegotiables" || rule === "both" || rule === "either") && !requiredMet ? `finish ${missing.join(", ")}` : "",
    (rule === "half" || rule === "both" || rule === "either") && !halfMet ? `complete ${halfLeft} more ${halfLeft === 1 ? "habit" : "habits"}` : ""
  ].filter(Boolean);
  const message = unlocked ? "Unlocked" : `Locked: ${todo.join(rule === "either" ? " or " : " and ")}`;

  return {
    rule,
    locked: !unlocked,
    message,
    completed: done.size,
    total: habits.length,
    halfNeeded,
    nonNegotiables: { completed: required.length - missing.length, total: required.length, missing }
  };
}

export type LockStatus = ReturnType<typeof lockStatus>;
