import { Router } from 'express';
import { getSuppliers, createSupplier } from '../controllers/suppliers.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getSuppliers);
router.post('/', createSupplier);

export default router;
