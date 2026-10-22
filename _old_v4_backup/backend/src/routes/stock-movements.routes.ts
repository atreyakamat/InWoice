import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  getStockMovements,
  getMovementDashboard,
  recordStockMovement,
} from '../controllers/stock-movements.controller';

const router = Router();
router.use(authenticate);

router.get('/', getStockMovements);
router.get('/dashboard', getMovementDashboard);
router.post('/', recordStockMovement);

export default router;