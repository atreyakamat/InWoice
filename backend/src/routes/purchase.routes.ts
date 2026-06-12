import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { PurchaseOrderService } from '../services/erp/purchase-order.service';

const router = Router();
const svc = new PurchaseOrderService();

// Create Purchase Order
router.post('/', async (req, res) => {
  try {
    const po = await svc.create(req.body);
    res.json(po);
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

// Receive items for a PO (partial/complete)
router.patch('/:id/receive', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    await svc.receive(req.params.id, req.body);
    res.json({ success: true });
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

// List PO
router.get('/', async (req, res) => {
  const list = await svc.list();
  res.json(list);
});

export default router;
