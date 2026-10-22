import { Router } from 'express';
import { getEvents, getEvent, createEvent, updateEventInventory } from '../controllers/events.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', getEvents);
router.get('/:id', getEvent);
router.post('/', createEvent);
router.patch('/:id/inventory', updateEventInventory);

export default router;
