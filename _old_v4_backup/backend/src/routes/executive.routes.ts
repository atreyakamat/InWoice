import { Router } from 'express';
import { getDashboardIntelligence, generateBriefing, updateOpportunity, askInWoice, triggerForecasting } from '../controllers/executive.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/dashboard', getDashboardIntelligence);
router.post('/generate-briefing', generateBriefing);
router.patch('/opportunities/:id', updateOpportunity);
router.post('/ask', askInWoice);
router.post('/forecast', triggerForecasting);

export default router;
