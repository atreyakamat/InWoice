import { Router } from 'express';
import { getFulfillments, updateFulfillmentStatus } from '../controllers/fulfillment.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getFulfillments);
router.patch('/:id/status', updateFulfillmentStatus);

export default router;
