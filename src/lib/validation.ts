import { z } from "zod";

const habitBase = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  type: z.enum(["boolean", "quantity", "duration", "count"]),
  targetValue: z.coerce.number().positive().optional().nullable(),
  unit: z.string().trim().max(24).optional().nullable(),
  icon: z.string().trim().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

export const habitInput = habitBase.extend({
  icon: habitBase.shape.icon.default("✨"),
  color: habitBase.shape.color.default("#7565d9")
}).superRefine((data, ctx) => {
  if (data.type !== "boolean" && !data.targetValue) {
    ctx.addIssue({ code: "custom", path: ["targetValue"], message: "Target is required" });
  }
});

export const habitPatch = habitBase.partial().extend({
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional()
});

export const entryInput = z.object({
  habitId: z.string().uuid(),
  timestamp: z.coerce.date(),
  value: z.coerce.number().positive(),
  note: z.string().trim().max(1000).optional().nullable()
});

export const entryPatch = z.object({
  timestamp: z.coerce.date().optional(),
  value: z.coerce.number().positive().optional(),
  note: z.string().trim().max(1000).optional().nullable()
});

const reminderBase = z.object({
  habitId: z.string().uuid(),
  enabled: z.boolean(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  intervalMinutes: z.coerce.number().int().min(15).max(1440).optional().nullable()
});

export const reminderInput = reminderBase.extend({
  enabled: reminderBase.shape.enabled.default(true)
}).superRefine((data, ctx) => {
  if (data.intervalMinutes && !data.endTime) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time is required for repeats" });
  }
});

export const reminderPatch = reminderBase.omit({ habitId: true }).partial();
