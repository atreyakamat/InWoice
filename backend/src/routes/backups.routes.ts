import express, { Router } from 'express';
import { badRequest } from '../lib/errors';
import { param } from '../lib/util';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { config } from '../lib/config';
import { backupDir, backupPath, exportData, gzipBackup, listBackups, offsiteConfig, parseBackup, restoreData, testOffsite, uploadOffsite, writeBackupFile } from '../services/backup.service';
import { getSettings } from '../services/settings.service';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/', async (_req, res) => {
  const s = await getSettings();
  res.json({
    success: true,
    data: {
      enabled: Boolean(backupDir()),
      directory: backupDir(),
      keep: config.backupKeep,
      files: listBackups(),
      offsite: { configured: Boolean(await offsiteConfig()), lastAt: s.offsiteLastAt, lastError: s.offsiteLastError },
    },
  });
});

/** Upload a tiny test file to check the off-site storage settings. */
router.post('/offsite/test', async (_req, res) => {
  const r = await testOffsite();
  res.json({ success: true, message: `Connected. Test file written to ${r.url}` });
});

/** Copy a backup file (the newest by default) to off-site storage now. */
router.post('/offsite/upload', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : listBackups()[0]?.name;
  if (!name) throw badRequest('There is no backup file yet. Back up now first.');
  await uploadOffsite(name);
  res.json({ success: true, message: `${name} copied off-site` });
});

/** Back up to disk now. */
router.post('/', async (_req, res) => {
  res.status(201).json({ success: true, data: await writeBackupFile('manual') });
});

/** Download a fresh backup straight to the browser (works even with disk backups off). */
router.get('/export', async (_req, res) => {
  const buf = gzipBackup(await exportData());
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="inwoice-export-${new Date().toISOString().slice(0, 10)}.json.gz"`);
  res.send(buf);
});

router.get('/files/:name', (req, res) => {
  res.download(backupPath(param(req.params.name)));
});

/**
 * Replace ALL data with an uploaded backup (moving to a new server, or undoing a disaster).
 * Requires ?confirm=REPLACE. A safety backup of the current data is written first.
 */
router.post('/restore', express.raw({ type: () => true, limit: '500mb' }), async (req, res) => {
  if (req.query.confirm !== 'REPLACE') throw badRequest('Add ?confirm=REPLACE to confirm that all current data will be replaced');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Upload a backup file');
  const backup = parseBackup(req.body);
  const safety = backupDir() ? await writeBackupFile('manual') : null;
  const counts = await restoreData(backup, { replace: true });
  res.json({ success: true, data: { restoredFrom: backup.createdAt, safetyBackup: safety?.name ?? null, rows: counts } });
});

export default router;
