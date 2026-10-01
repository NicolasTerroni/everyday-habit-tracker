import { Client } from "@upstash/qstash";

const token = process.env.QSTASH_TOKEN;
const appUrl = process.env.APP_URL?.replace(/\/$/, "");

if (!token || !appUrl) {
  console.error("Set QSTASH_TOKEN and APP_URL before running this command.");
  console.error("Example: QSTASH_TOKEN=... APP_URL=https://your-app.vercel.app npm run qstash:setup");
  process.exit(1);
}

const client = new Client({ token });
const result = await client.schedules.create({
  destination: `${appUrl}/api/cron/reminders`,
  cron: "*/15 * * * *",
  scheduleId: "everyday-reminders",
  retries: 1
});

console.log(`Everyday reminder schedule is active: ${result.scheduleId}`);
