import fs from 'fs';
import path from 'path';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './lib/config';
import prisma from './lib/prisma';
import { errorHandler, HttpError } from './lib/errors';
import authRoutes from './routes/auth.routes';
import settingsRoutes from './routes/settings.routes';
import customerRoutes from './routes/customers.routes';
import invoiceRoutes from './routes/invoices.routes';
import creditNoteRoutes from './routes/creditnotes.routes';
import reportRoutes from './routes/reports.routes';
import backupRoutes from './routes/backups.routes';
import billRoutes from './routes/bills.routes';
import expenseRoutes from './routes/expenses.routes';
import quoteRoutes from './routes/quotes.routes';
import recurringRoutes from './routes/recurring.routes';
import portalRoutes from './routes/portal.routes';
import auditRoutes from './routes/audit.routes';
import platformRoutes from './routes/platform.routes';
import bankRoutes from './routes/bank.routes';
import actionsRoutes from './routes/actions.routes';
import mailRoutes from './routes/mail.routes';
import googleRoutes from './routes/google.routes';
import posRoutes from './routes/pos.routes';
import { handleWebhook } from './services/youpi.service';
import { tenantResolver } from './middlewares/tenant';
import { auditTrail } from './services/audit.service';
import { packsRouter, productsRouter } from './routes/catalog.routes';
import { inventoryRouter, stockMovementsRouter } from './routes/inventory.routes';
import { purchaseOrdersRouter, suppliersRouter } from './routes/procurement.routes';
import { bomRouter, productionRouter } from './routes/production.routes';
import { eventsRouter, fulfillmentRouter } from './routes/fulfillment-events.routes';
import { dashboardRouter, executiveRouter, exportRouter } from './routes/insights.routes';
import { alertState } from './lib/alerts';

const APP_VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
})();

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind nginx/Caddy for rate limiting
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", 'blob:'],
        objectSrc: ["'self'", 'blob:'],
        // Off so the app also works over plain HTTP on a LAN (e.g. http://192.168.1.10:5000).
        upgradeInsecureRequests: null,
      },
    },
  }),
);
app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : { origin: config.isProd ? false : true }));
// Gateway webhooks need the exact bytes for the signature, so they come before the JSON parser.
app.post('/api/payments/youpi/webhook', express.raw({ type: () => true, limit: '256kb' }), tenantResolver, async (req: Request, res: Response) => {
  res.json(await handleWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.headers));
});
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok', time: new Date().toISOString(), version: APP_VERSION, uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576), alerts: alertState() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use('/api', tenantResolver);
app.use('/api', auditTrail);
app.use('/api/platform', platformRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/executive', executiveRouter);
app.use('/api/export', exportRouter);
app.use('/api/customers', customerRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/actions', actionsRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/products', productsRouter);
app.use('/api/packs', packsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/stock-movements', stockMovementsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/bom', bomRouter);
app.use('/api/production', productionRouter);
app.use('/api/fulfillments', fulfillmentRouter);
app.use('/api/events', eventsRouter);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API route not found')));

// In production the backend also serves the built frontend: one process, one port.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist, { maxAge: '7d', index: false }));
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(errorHandler);

export default app;
