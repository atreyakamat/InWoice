import { Router } from 'express';
import { getProductionBatches, createProductionBatch } from '../controllers/production.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getProductionBatches);
router.post('/', createProductionBatch);

export default router;
