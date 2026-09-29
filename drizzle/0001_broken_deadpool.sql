CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "entries_positive_value_check" CHECK ("habit_entries"."value" > 0);--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_type_check" CHECK ("habits"."type" in ('boolean', 'quantity', 'duration', 'count'));--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_target_check" CHECK (("habits"."type" = 'boolean' and "habits"."target_value" is null) or ("habits"."type" <> 'boolean' and "habits"."target_value" > 0 and length("habits"."unit") > 0));--> statement-breakpoint
ALTER TABLE "notification_executions" ADD CONSTRAINT "notification_status_check" CHECK ("notification_executions"."status" in ('processing', 'sent', 'failed', 'skipped'));--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_interval_check" CHECK ("reminders"."interval_minutes" is null or "reminders"."interval_minutes" between 15 and 1440);--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_repeat_end_check" CHECK ("reminders"."interval_minutes" is null or "reminders"."end_time" is not null);