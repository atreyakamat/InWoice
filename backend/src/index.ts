import app from './app';
import { config } from './lib/config';
import prisma from './lib/prisma';
import { startScheduler } from './services/scheduler';
import { disconnectTenants } from './lib/tenancy';
import { ensureControl, migrateAllTenants } from './services/platform.service';
import { reportError } from './lib/alerts';

async function start() {
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('Could not connect to PostgreSQL. Check DATABASE_URL in backend/.env');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  if (config.multiTenant) {
    // Bring every business's schema up to date before taking requests.
    await ensureControl();
    for (const r of await migrateAllTenants()) {
      if (r.error) {
        console.error(`[tenants] ${r.slug}: migration failed: ${r.error}`);
        void reportError(`migration (${r.slug})`, r.error);
      }
      else if (r.applied.length) console.log(`[tenants] ${r.slug}: applied ${r.applied.join(', ')}`);
    }
    console.log(`Multi-business mode on${config.baseDomain ? ` (*.${config.baseDomain})` : ''}`);
  }
  const server = app.listen(config.port, () => {
    console.log(`InWoice API listening on http://localhost:${config.port} (${config.isProd ? 'production' : 'development'})`);
  });
  // Daily backup + payment reminders. DISABLE_SCHEDULER=1 turns them off (e.g. for a second instance).
  const stopScheduler = process.env.DISABLE_SCHEDULER === '1' ? () => undefined : startScheduler();

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    stopScheduler();
    server.close(() => undefined);
    await disconnectTenants();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  // Log and alert rather than die on a stray rejected promise; a real crash is reported, then exits.
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    void reportError('unhandled rejection', err);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    void reportError('crash', err).finally(() => process.exit(1));
  });
}

void start();
