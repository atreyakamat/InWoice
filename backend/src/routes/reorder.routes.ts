import { Router } from 'express';
import { ReorderService } from '../services/erp/reorder.service';

const router = Router();
const svc = new ReorderService();

// Endpoint to get low-stock items with AI recommendation
router.get('/low-stock', async (req, res) => {
  const userId = (req as any).user?.id || 'system';
  try {
    const data = await svc.getLowStockWithRecommendation(userId);
    res.json(data);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
