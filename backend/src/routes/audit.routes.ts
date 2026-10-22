import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { pagination, qs } from '../lib/util';
import { authenticate, requireRole } from '../middlewares/auth';

/** The audit log: owners and accountants can see who changed what. */
const router = Router();
router.use(authenticate, requireRole('ADMIN', 'ACCOUNTANT'));

router.get('/', async (req, res) => {
  const from = qs(req.query.from);
  const to = qs(req.query.to);
  const q = qs(req.query.q);
  const where: Prisma.AuditLogWhereInput = {
    ...(qs(req.query.userId) ? { userId: qs(req.query.userId) } : {}),
    ...(qs(req.query.entity) ? { entity: qs(req.query.entity) } : {}),
    ...(qs(req.query.entityId) ? { entityId: qs(req.query.entityId) } : {}),
    ...(qs(req.query.action) ? { action: qs(req.query.action) } : {}),
    ...(q ? { OR: [{ label: { contains: q, mode: 'insensitive' } }, { userName: { contains: q, mode: 'insensitive' } }, { path: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000) } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pagination(req.query) }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ success: true, data: rows, total });
});

export default router;
