import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { ProductionService } from '../services/erp/production.service';

const router = Router();
const svc = new ProductionService();

// List production batches (simple placeholder – extend as needed)
router.get('/', async (req, res) => {
  const batches = await svc.list?.(); // If you implement list method later
  res.json(batches || []);
});

// Create a new production batch
router.post('/', async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const userId = (req as any).user?.id || 'system';
    const batch = await svc.createBatch(req.body, userId);
    res.json(batch);
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
