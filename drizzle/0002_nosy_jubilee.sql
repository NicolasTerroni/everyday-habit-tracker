ALTER TABLE "habits" ADD COLUMN "non_negotiable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lock_rule" text DEFAULT 'off' NOT NULL;