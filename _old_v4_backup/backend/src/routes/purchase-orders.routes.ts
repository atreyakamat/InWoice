import { Router } from 'express';
import { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, receivePurchaseOrder } from '../controllers/purchase-orders.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getPurchaseOrders);
router.get('/:id', getPurchaseOrder);
router.post('/', createPurchaseOrder);
router.post('/:id/receive', receivePurchaseOrder);

export default router;
