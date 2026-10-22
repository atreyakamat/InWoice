import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  receivePurchaseOrder,
  getPurchaseOrderDashboard,
} from '../controllers/purchase-orders.controller';

const router = Router();
router.use(authenticate);

router.get('/', getPurchaseOrders);
router.get('/dashboard', getPurchaseOrderDashboard);
router.get('/:id', getPurchaseOrder);
router.post('/', createPurchaseOrder);
router.patch('/:id/receive', receivePurchaseOrder);

export default router;
