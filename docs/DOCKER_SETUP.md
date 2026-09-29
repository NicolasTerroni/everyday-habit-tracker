# Everyday — Docker and New-Laptop Handoff

This is the shortest path for starting the complete application on another computer. Docker Compose runs both the Next.js application and PostgreSQL; the app applies committed database migrations automatically before it starts.

## What to install

Install:

- Docker Desktop on macOS/Windows, or Docker Engine with the Compose plugin on Linux;
- Node.js 20.9 or newer. Node is only used by the convenience launcher; all application dependencies run inside Docker.

Verify both:

```bash
docker compose version
node --version
```

## One-command start

From the repository root:

```bash
npm run docker:up
```

The launcher:

1. creates the ignored `.env.docker` file if it does not exist;
2. generates a random PostgreSQL password, Better Auth secret, and VAPID key pair;
3. detects a likely LAN address and adds it as a trusted login origin;
4. builds the application image;
5. starts PostgreSQL;
6. waits for PostgreSQL, applies migrations, and starts Everyday.

Open <http://localhost:3000> and create an account. The first image build can take several minutes; later builds reuse Docker's cache.

Press `Ctrl+C` to stop the foreground stack. The database volume is preserved. To run the services in the background instead, use:

```bash
docker compose --env-file .env.docker up --build --detach
```

Stop background services explicitly when finished:

```bash
npm run docker:down
```

Start them again with `npm run docker:up`. Habits and accounts persist in the named Docker volume.

## Useful commands

```bash
npm run docker:init       # generate .env.docker without starting containers
npm run docker:up         # generate config, build, migrate, and start
npm run docker:logs       # follow app and database logs
npm run docker:down       # stop containers; keep database data
docker compose --env-file .env.docker build app
docker compose --env-file .env.docker ps
```

To rebuild after source-code changes:

```bash
docker compose --env-file .env.docker up --build
```

To apply migrations manually:

```bash
docker compose --env-file .env.docker exec app node migrate.cjs
```

## Data and reset behavior

`npm run docker:down` preserves the PostgreSQL volume. The following command permanently deletes the Docker database, accounts, habits, and history:

```bash
docker compose --env-file .env.docker down --volumes
```

Only use that command when a complete local reset is intentional.

The database is also available to host tools at `127.0.0.1:55433`. Its generated credentials are in `.env.docker`.

## Open it from a phone

The initializer adds the laptop's likely LAN address to `BETTER_AUTH_TRUSTED_ORIGINS`. It prints that address when `.env.docker` is first created. With both devices on the same network, open:

```text
http://LAPTOP_LAN_IP:3000
```

If the laptop's IP changes, edit `BETTER_AUTH_TRUSTED_ORIGINS` in `.env.docker`, add the new complete origin, and restart the app container:

```bash
docker compose --env-file .env.docker up -d --force-recreate app
```

Plain LAN HTTP is enough for UI and login testing. iPhone PWA installation and Web Push should still be tested on the HTTPS Vercel deployment.

## Build only the application image

Compose is the recommended local workflow because the application requires PostgreSQL. To build only the image:

```bash
npm run docker:init
docker compose --env-file .env.docker build app
```

The resulting local image is named:

```text
everyday-habit-tracker:local
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is a build-time browser variable. Always provide the same public key at build time and runtime. The Compose configuration handles this automatically.

## Production notes

- `.env.docker` contains secrets and is ignored by both Git and the Docker build context. Never commit it.
- The generated secrets are for the local laptop only. Generate separate secrets for Vercel or any other production environment.
- The container uses Next.js standalone output and runs as the unprivileged `node` user.
- The image has a health check and applies Drizzle migrations before each start. Already-applied migrations are skipped.
- PostgreSQL is bound to `127.0.0.1`, while the web application is exposed to the LAN on port 3000.
- QStash is intentionally blank locally. Scheduled reminders are activated separately for the HTTPS deployment.
- Vercel continues to use its native Next.js build. Adding Docker files does not replace the documented GitHub-to-Vercel workflow.

## Handoff prompt for ChatGPT/Codex on the other laptop

Open the repository in ChatGPT/Codex and send:

> Read `AGENTS.md`, `README.md`, `docs/DEVELOPER_GUIDE.md`, and `docs/DOCKER_SETUP.md`. Verify Docker is running, then execute `npm run docker:up`. Wait for the app and database to become healthy, open `http://localhost:3000`, and diagnose any startup error without deleting the Docker volume. Do not commit `.env.docker`.

The other agent should use these checks if startup fails:

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=200 app database
```
