/**
 * Multi-business (SaaS) administration from the server (run from backend/ after a build):
 *   npm run platform -- create-admin <email> <password>       platform admin for /platform
 *   npm run platform -- create <slug> "<Business>" <owner email> <password> [plan]
 *   npm run platform -- adopt <slug> "<Business>"             turn this install's existing data into a business
 *   npm run platform -- list                                  every business with its plan and status
 *   npm run platform -- migrate                               apply new migrations to every business
 */
import { baseClient } from '../lib/prisma';
import { disconnectTenants } from '../lib/tenancy';
import { PLAN_KEYS, accountState, adoptPublicSchema, createPlatformAdmin, createTenant, listTenants, migrateAllTenants, type Plan } from '../services/platform.service';

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'create-admin': {
      const [email, password] = args;
      if (!email || !password) throw new Error('Usage: create-admin <email> <password>');
      await createPlatformAdmin(email, password);
      console.log(`Platform admin ${email} is ready. Sign in at https://<BASE_DOMAIN>/platform`);
      break;
    }
    case 'create': {
      const [slug, name, email, password, plan = 'TRIAL'] = args;
      if (!slug || !name || !email || !password) throw new Error('Usage: create <slug> "<Business name>" <owner email> <password> [plan]');
      if (!PLAN_KEYS.includes(plan as Plan)) throw new Error(`Plan must be one of ${PLAN_KEYS.join(', ')}`);
      const t = await createTenant({ slug, name, ownerName: name, ownerEmail: email, ownerPassword: password, plan: plan as Plan });
      console.log(`Created ${t.name} (${t.slug}) in schema ${t.schemaName}`);
      break;
    }
    case 'adopt': {
      const [slug, name] = args;
      if (!slug || !name) throw new Error('Usage: adopt <slug> "<Business name>"');
      const t = await adoptPublicSchema(slug, name);
      console.log(`The existing data is now the business "${t.name}" at ${t.slug}.<BASE_DOMAIN>`);
      break;
    }
    case 'list': {
      for (const t of await listTenants()) {
        const st = accountState(t);
        console.log(`${t.slug.padEnd(24)} ${t.plan.padEnd(9)} ${t.status.padEnd(10)} ${st.state.padEnd(10)} ${t.name}`);
      }
      break;
    }
    case 'migrate': {
      for (const r of await migrateAllTenants()) console.log(`${r.slug}: ${r.error ? `FAILED ${r.error}` : r.applied.length ? `applied ${r.applied.join(', ')}` : 'up to date'}`);
      break;
    }
    default:
      throw new Error('Commands: create-admin, create, adopt, list, migrate');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectTenants();
    await baseClient.$disconnect();
  });
