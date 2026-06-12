import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { SupplierService } from '../services/erp/supplier.service';

const router = Router();
const svc = new SupplierService();

// Create supplier
router.post('/', async (req, res) => {
  try {
    const supplier = await svc.create(req.body);
    res.json(supplier);
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

// Update supplier
router.patch('/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const supplier = await svc.update(req.params.id, req.body);
    res.json(supplier);
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

// Get supplier by ID
router.get('/:id', param('id').isUUID(), async (req, res) => {
  try {
    const supplier = await svc.get(req.params.id);
    res.json(supplier);
  } catch (e:any) {
    res.status(404).json({ error: e.message });
  }
});

// List all suppliers
router.get('/', async (req, res) => {
  const list = await svc.list();
  res.json(list);
});

export default router;

