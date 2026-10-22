import { Router } from 'express';
import { getInvoices, createInvoice, updateInvoiceStatus } from '../controllers/invoices.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getInvoices);
router.post('/', createInvoice);
router.patch('/:id/status', updateInvoiceStatus);

export default router;
