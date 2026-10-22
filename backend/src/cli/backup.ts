/**
 * Command-line backups (run from backend/ after `npm run build`):
 *   npm run backup                          write a backup to BACKUP_DIR (default ./backups)
 *   npm run backup -- export <file>         write a backup to a specific file
 *   npm run restore -- <file>               load a backup into an EMPTY, migrated database
 *   npm run restore -- <file> --replace     replace all existing data (careful!)
 */
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { exportData, gzipBackup, parseBackup, restoreData, writeBackupFile } from '../services/backup.service';

async function main() {
  const [cmd = 'backup', target, ...flags] = process.argv.slice(2);
  if (cmd === 'backup') {
    const b = await writeBackupFile('manual');
    console.log(`Backup written: ${b.name} (${Math.round(b.size / 1024)} KB)`);
  } else if (cmd === 'export') {
    if (!target) throw new Error('Usage: backup export <file.json.gz>');
    fs.writeFileSync(target, gzipBackup(await exportData()));
    console.log(`Backup written: ${path.resolve(target)}`);
  } else if (cmd === 'restore') {
    if (!target || !fs.existsSync(target)) throw new Error('Usage: restore <file.json.gz> [--replace]');
    const backup = parseBackup(fs.readFileSync(target));
    const counts = await restoreData(backup, { replace: flags.includes('--replace') });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    console.log(`Restored ${total} rows from a backup taken ${backup.createdAt}.`);
  } else {
    throw new Error(`Unknown command "${cmd}". Use backup, export or restore.`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
