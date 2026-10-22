import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { draftReminders, runAction, runInput, suggestedActions } from '../services/actions.service';
import { buildOwnerDigest, runOwnerDigest } from '../services/digest.service';
import { previousMonth } from '../services/documents.service';

/**
 * Suggested actions you approve before anything happens, and the owners' monthly summary.
 * Chasing money, ordering stock and emailing customers are owner decisions: admins only.
 */
const router = Router();
router.use(authenticate, requireAdmin);

router.get('/', async (_req, res) => {
  res.json({ success: true, data: await suggestedActions() });
});

/** Reminder emails to review before sending (AI-written when AI is on). */
router.post('/reminders/draft', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(20) }).parse(req.body);
  res.json({ success: true, data: await draftReminders(ids) });
});

/** Run exactly the approved items. */
router.post('/run', async (req, res) => {
  res.json({ success: true, data: await runAction(runInput.parse(req.body)) });
});

router.get('/digest/preview', async (_req, res) => {
  res.json({ success: true, data: await buildOwnerDigest(previousMonth()) });
});

router.post('/digest/send', async (_req, res) => {
  res.json({ success: true, data: await runOwnerDigest(new Date(), true) });
});

export default router;
