import { Router } from 'express';
import { askCopilot } from '../controllers/ai.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.post('/copilot', askCopilot);

export default router;
