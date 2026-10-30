import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requireAdmin } from '../middlewares/auth';
import { installedBrowsers, isLocalRequest, openMailInBrowser } from '../services/browser.service';

/** Opening Gmail/Outlook in a chosen browser (InWoice running on this computer only). */
const router = Router();
router.use(authenticate);

router.get('/browsers', requireAdmin, (req, res) => {
  const local = isLocalRequest(req);
  res.json({ success: true, data: { available: local, browsers: local ? installedBrowsers() : [] } });
});

router.post('/open', authorize('sales'), async (req, res) => {
  const { url } = z.object({ url: z.string().url() }).parse(req.body);
  res.json({ success: true, data: await openMailInBrowser(req, url) });
});

export default router;
