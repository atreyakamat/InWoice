import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustStock,
  getInventoryDashboard,
} from '../controllers/inventory.controller';

const router = Router();
router.use(authenticate);

router.get('/', getInventoryItems);
router.get('/dashboard', getInventoryDashboard);
router.get('/:id', getInventoryItem);
router.post('/', createInventoryItem);
router.put('/:id', updateInventoryItem);
router.patch('/:id/adjust', adjustStock);
router.delete('/:id', deleteInventoryItem);

export default router;
