export type HabitType = "boolean" | "quantity" | "duration" | "count";

export type Habit = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  type: HabitType;
  targetValue: string | null;
  unit: string | null;
  icon: string;
  color: string;
  sortOrder: number;
  active: boolean;
  nonNegotiable: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type Entry = {
  id: string;
  habitId: string;
  timestamp: string;
  value: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Reminder = {
  id: string;
  habitId: string;
  enabled: boolean;
  startTime: string;
  endTime: string | null;
  intervalMinutes: number | null;
};

export type AppData = {
  habits: Habit[];
  entries: Entry[];
  reminders: Reminder[];
  timezone: string;
  from: string;
  to: string;
};
