import { Router } from 'express';
import { getDashboardIntelligence, generateBriefing } from '../controllers/executive.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/dashboard', getDashboardIntelligence);
router.post('/generate-briefing', generateBriefing);

export default router;
