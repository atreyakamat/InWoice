# Setup Guide (local development)

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or newer | `node -v` |
| PostgreSQL | 14 or newer | Any port; the connection string says which |
| Chrome or Edge | any | Only for the optional browser smoke test |

No Python, Docker, Redis or headless-Chrome download is needed.

## 1. Database

Connect as the `postgres` superuser, using `psql` or pgAdmin:

```sql
CREATE ROLE inwoice LOGIN PASSWORD 'change-me' CREATEDB;
CREATE DATABASE inwoice OWNER inwoice;
CREATE DATABASE inwoice_test OWNER inwoice;   -- used only by `npm test`, wiped on every run
```

**Windows:** the PostgreSQL installer runs it as a service, and `psql.exe` is in
`C:\Program Files\PostgreSQL\<version>\bin`. Check the port in
`C:\Program Files\PostgreSQL\<version>\data\postgresql.conf`. It is often not 5432 when
several versions are installed. On the original dev machine it is **5435**.

## 2. Backend configuration

```bash
cp backend/.env.example backend/.env
```

Set at least:

```ini
DATABASE_URL="postgresql://inwoice:change-me@127.0.0.1:5432/inwoice?schema=public"
TEST_DATABASE_URL="postgresql://inwoice:change-me@127.0.0.1:5432/inwoice_test?schema=public"
JWT_SECRET=<output of: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
```

AI and SMTP settings are optional. You can enter them later in the app under **Settings**.

## 3. Install and run

```bash
npm run setup     # installs both apps and applies database migrations
npm run seed      # optional demo data (demo@inwoice.local / demo12345)
npm run dev       # API on :5000 + web on :5173 with hot reload
```

Open http://localhost:5173. Without seed data, you'll get the **first-run setup** screen to
create the owner account.

You can also run the two halves separately:

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```

## Useful commands

| Command | What it does |
|---|---|
| `npm --prefix backend run db:migrate -- --name <change>` | Create a migration after editing `schema.prisma` |
| `npm --prefix backend run db:deploy` | Apply pending migrations (production) |
| `npm --prefix backend run db:studio` | Browse the database in the browser |
| `npm --prefix backend run typecheck` | Type-check the API |
| `npm test` | API tests + frontend type-check |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Could not connect to PostgreSQL` | Check the host, port and password in `DATABASE_URL`, and that the service is running (`services.msc` on Windows). |
| `EPERM ... query_engine-windows.dll.node` during `prisma generate` | A running API process holds the file. Stop `npm run dev` and retry. |
| The web app says "Cannot reach the server" | The API isn't running on :5000, or `VITE_API_PROXY` points somewhere else. |
| "Too many login attempts" | The login rate limit is 20 per 15 minutes per IP. Wait, or restart the API in development. |
| `TEST_DATABASE_URL must differ from DATABASE_URL` | Tests wipe their database. Give them their own. |
