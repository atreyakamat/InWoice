import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { optDate, optGstin, optStr, requestOrigin } from '../lib/util';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { getSettings, publicBaseUrl, toPublicSettings } from '../services/settings.service';
import { testYoupi } from '../services/youpi.service';
import { CLAUDE_MODELS, generate, getAiConfig, isAiEnabled, type AiProvider } from '../services/ai.service';
import { isEmailConfigured, sendMail } from '../services/email.service';
import { dueReminders, parseReminderDays, runReminders } from '../services/reminder.service';
import { runMonthlyStatements } from '../services/documents.service';

const router = Router();
router.use(authenticate);

const MAX_LOGO_CHARS = 700_000; // ~500 KB image as a data URL

const settingsInput = z.object({
  businessName: z.string().trim().min(1).optional(),
  areaRoundUp: z.coerce.number().refine((v) => [0, 0.1, 0.25, 0.5, 1].includes(v), 'Round up to 0 (exact), 0.1, 0.25, 0.5 or 1').optional(),
  signatureUrl: z
    .string()
    .max(MAX_LOGO_CHARS, 'Signature image is too large (max ~500 KB)')
    .refine((v) => v === '' || /^data:image\/(png|jpe?g);base64,/.test(v), 'Signature must be a PNG/JPEG image')
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
  logoUrl: z
    .string()
    .max(MAX_LOGO_CHARS, 'Logo is too large (max ~500 KB)')
    .refine((v) => v === '' || /^data:image\/(png|jpe?g);base64,/.test(v) || /^https?:\/\//.test(v), 'Logo must be a PNG/JPEG image')
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
  address: optStr,
  state: optStr,
  email: optStr,
  phone: optStr,
  website: optStr,
  gstNumber: optGstin,
  creditNotePrefix: z.string().trim().max(12).optional(),
  quotePrefix: z.string().trim().max(12).optional(),
  debitNotePrefix: z.string().trim().max(12).optional(),
  nextDebitNoteNumber: z.coerce.number().int().min(1).optional(),
  nextQuoteNumber: z.coerce.number().int().min(1).optional(),
  quoteValidityDays: z.coerce.number().int().min(1).max(365).optional(),
  statementsEnabled: z.boolean().optional(),
  ownerDigestEnabled: z.boolean().optional(),
  lockedUntil: optDate,
  s3Endpoint: z
    .union([z.literal(''), z.string().trim().url('Enter the full endpoint address, e.g. https://<account>.r2.cloudflarestorage.com')])
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v ? v.replace(/\/+$/, '') : null)),
  s3Region: optStr,
  s3Bucket: optStr,
  s3Prefix: optStr,
  s3AccessKey: optStr,
  s3SecretKey: z.string().optional(),
  appUrl: z
    .union([z.literal(''), z.string().trim().url('Enter the full address, e.g. https://billing.mybusiness.in')])
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v ? v.replace(/\/+$/, '') : null)),
  nextCreditNoteNumber: z.coerce.number().int().min(1).optional(),
  upiId: optStr,
  bankName: optStr,
  accountNumber: optStr,
  ifscCode: optStr,
  currency: z.string().trim().min(3).max(3).toUpperCase().optional(),
  currencySymbol: z.string().trim().min(1).max(4).optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional(),
  invoicePrefix: z.string().trim().max(12).optional(),
  nextInvoiceNumber: z.coerce.number().int().min(1).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
  remindersEnabled: z.boolean().optional(),
  reminderDays: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : parseReminderDays(v).join(','))),
  invoiceFooter: optStr,
  termsConditions: optStr,
  thankYouMessage: optStr,
  smtpHost: optStr,
  smtpPort: optStr,
  smtpUsername: optStr,
  smtpFrom: optStr,
  // Secrets: undefined = keep, "" = clear, value = replace
  smtpPassword: z.string().optional(),
  aiProvider: z.enum(['NONE', 'ANTHROPIC', 'OLLAMA']).optional(),
  aiModel: optStr,
  aiApiKey: z.string().optional(),
  ollamaUrl: optStr,
  youpiEnabled: z.boolean().optional(),
  youpiApiUrl: z
    .union([z.literal(''), z.string().trim().url('Enter the full gateway address, e.g. https://pay.mybusiness.in')])
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v ? v.replace(/\/+$/, '') : null)),
  youpiMerchantId: optStr,
  youpiWebhookSecret: z.string().optional(),
  mailBrowser: optStr,
  googleClientId: optStr,
  googleClientSecret: z.string().optional(),
  autoMailUserId: optStr,
  mailBrowserProfile: optStr,
});

router.get('/', async (req, res) => {
  const s = await getSettings();
  res.json({
    success: true,
    data: toPublicSettings(s),
    meta: {
      aiEnabled: await isAiEnabled(),
      emailConfigured: await isEmailConfigured(),
      claudeModels: CLAUDE_MODELS,
      youpiWebhookUrl: `${(await publicBaseUrl(requestOrigin(req))) ?? requestOrigin(req)}/api/payments/youpi/webhook`,
    },
  });
});

router.put('/', requireAdmin, async (req, res) => {
  const input = settingsInput.parse(req.body);
  const s = await getSettings();
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (input.autoMailUserId) {
    const u = await prisma.user.findUnique({ where: { id: input.autoMailUserId }, select: { isActive: true, gmailRefreshToken: true } });
    if (!u?.isActive || !u.gmailRefreshToken) throw badRequest('That person has not connected their Gmail');
  }
  for (const secret of ['smtpPassword', 'aiApiKey', 's3SecretKey', 'youpiWebhookSecret', 'googleClientSecret'] as const) {
    if (input[secret] === undefined) delete data[secret];
    else data[secret] = input[secret].trim() === '' ? null : input[secret].trim();
  }
  const updated = await prisma.businessSettings.update({ where: { id: s.id }, data });
  res.json({ success: true, data: toPublicSettings(updated) });
});

/** Check the YouPI gateway answers, with the saved or proposed (unsaved) details. */
router.post('/test-youpi', requireAdmin, async (req, res) => {
  const body = z.object({ youpiApiUrl: optStr, youpiMerchantId: optStr, youpiWebhookSecret: z.string().optional() }).parse(req.body ?? {});
  res.json({ success: true, data: await testYoupi({ apiUrl: body.youpiApiUrl ?? undefined, merchantId: body.youpiMerchantId ?? undefined, secret: body.youpiWebhookSecret || undefined }) });
});

/** Send a tiny prompt through the selected (or proposed, unsaved) AI provider. */
router.post('/test-ai', requireAdmin, async (req, res) => {
  const body = z
    .object({
      aiProvider: z.enum(['NONE', 'ANTHROPIC', 'OLLAMA']).optional(),
      aiModel: optStr,
      aiApiKey: z.string().optional(),
      ollamaUrl: optStr,
    })
    .parse(req.body ?? {});
  const current = await getAiConfig();
  const provider = (body.aiProvider ?? current.provider) as AiProvider;
  if (provider === 'NONE') throw badRequest('Select Claude or Local AI first');
  const override = {
    provider,
    model: body.aiModel || (provider === current.provider ? current.model : provider === 'ANTHROPIC' ? CLAUDE_MODELS[0] : 'qwen2.5:1.5b'),
    apiKey: body.aiApiKey?.trim() || current.apiKey,
    ollamaUrl: (body.ollamaUrl || current.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, ''),
  };
  const started = Date.now();
  const result = await generate(
    { system: 'You are a connectivity check. Reply with a short greeting.', prompt: 'Say hello in five words or fewer.', maxTokens: 200 },
    override,
  );
  res.json({ success: true, data: { reply: result.text, provider: result.provider, model: result.model, ms: Date.now() - started } });
});

/** Which invoices would get an automatic reminder right now. */
router.get('/reminders/preview', async (_req, res) => {
  const s = await getSettings();
  res.json({ success: true, data: { enabled: s.remindersEnabled, emailConfigured: await isEmailConfigured(), due: await dueReminders() } });
});

router.post('/reminders/run', requireAdmin, async (_req, res) => {
  res.json({ success: true, data: await runReminders() });
});

/** Send last month's statements now (normally done automatically once a month). */
router.post('/statements/run', requireAdmin, async (_req, res) => {
  res.json({ success: true, data: await runMonthlyStatements() });
});

router.post('/test-email', requireAdmin, async (req, res) => {
  const { to } = z.object({ to: z.string().trim().email() }).parse(req.body);
  const s = await getSettings();
  await sendMail({
    to,
    subject: `InWoice test email from ${s.businessName}`,
    text: 'Your email settings work. Invoices can now be emailed from InWoice.',
  });
  res.json({ success: true, message: `Test email sent to ${to}` });
});

export default router;
