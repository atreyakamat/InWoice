import { Router } from 'express';
import { BomService } from '../services/erp/bom.service';

const router = Router();
const svc = new BomService();

// Upsert BOM for a product (create or replace)
router.post('/', async (req, res) => {
  try {
    const bom = await svc.upsertBom(req.body);
    res.json(bom);
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

// Get BOM by product ID
router.get('/product/:productId', async (req, res) => {
  try {
    const bom = await svc.getByProduct(req.params.productId);
    res.json(bom);
  } catch (e:any) {
    res.status(404).json({ error: e.message });
  }
});

export default router;

