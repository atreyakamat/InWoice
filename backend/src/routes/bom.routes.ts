import { Router } from 'express';
import { getBOM, updateBOM } from '../controllers/bom.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/:productId', getBOM);
router.put('/:productId', updateBOM);

export default router;
