import { Router } from 'express';
import { getPacks, getPack, createPack, updatePack, deletePack } from '../controllers/packs.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPacks);
router.get('/:id', getPack);
router.post('/', createPack);
router.put('/:id', updatePack);
router.delete('/:id', deletePack);

export default router;
