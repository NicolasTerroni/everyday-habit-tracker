import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  appName: "Everyday",
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128
  },
  user: {
    additionalFields: {
      timezone: {
        type: "string",
        required: false,
        defaultValue: "Europe/Rome",
        input: true
      }
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5
    }
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100
  },
  plugins: [nextCookies()]
});

export type AppSession = typeof auth.$Infer.Session;
