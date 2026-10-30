import { Router } from 'express';
import { z } from 'zod';
import { param, qs, requestOrigin } from '../lib/util';
import { authenticate, authorize } from '../middlewares/auth';
import { catalog, daySummary, receipt, recordSale, saleInput, upiQr } from '../services/pos.service';

/** Point of sale (counter billing). */
const router = Router();
router.use(authenticate, authorize('sales'));

router.get('/catalog', async (_req, res) => {
  res.json({ success: true, data: await catalog() });
});

router.post('/sale', async (req, res) => {
  res.status(201).json({ success: true, data: await recordSale(saleInput.parse(req.body), requestOrigin(req)) });
});

router.post('/upi-qr', async (req, res) => {
  const { amount, note } = z.object({ amount: z.coerce.number().positive(), note: z.string().max(60).default('Counter sale') }).parse(req.body);
  res.json({ success: true, data: await upiQr(amount, note) });
});

router.get('/summary', async (req, res) => {
  const day = qs(req.query.date);
  res.json({ success: true, data: await daySummary(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00`) : new Date()) });
});

router.get('/receipt/:id', async (req, res) => {
  res.json({ success: true, data: await receipt(param(req.params.id)) });
});

export default router;
