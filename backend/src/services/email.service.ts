import nodemailer from 'nodemailer';
import type { BusinessSettings } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { badRequest, HttpError } from '../lib/errors';
import { getSettings } from './settings.service';

function smtpConfig(s: BusinessSettings) {
  const host = s.smtpHost || config.smtp.host;
  const user = s.smtpUsername || config.smtp.user;
  const pass = s.smtpPassword || config.smtp.password;
  const port = Number(s.smtpPort || config.smtp.port || 587);
  const from = s.smtpFrom || config.smtp.from || user;
  return { host, user, pass, port, from };
}

export async function isEmailConfigured() {
  const c = smtpConfig(await getSettings());
  return Boolean(c.host && c.user && c.pass);
}

interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer }[];
  referenceType?: string;
  referenceId?: string;
}

export async function sendMail(mail: Mail) {
  const s = await getSettings();
  const c = smtpConfig(s);
  if (!c.host || !c.user || !c.pass) {
    throw badRequest('Email is not configured. Add SMTP details in Settings > Email.');
  }
  const transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 15_000,
  });
  try {
    await transport.sendMail({
      from: `"${s.businessName}" <${c.from}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments,
    });
    await prisma.emailLog.create({
      data: { toAddress: mail.to, subject: mail.subject, status: 'SENT', referenceType: mail.referenceType, referenceId: mail.referenceId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.emailLog.create({
      data: { toAddress: mail.to, subject: mail.subject, status: 'FAILED', errorMessage: message, referenceType: mail.referenceType, referenceId: mail.referenceId },
    });
    throw new HttpError(502, `Email could not be sent: ${message}`);
  }
}
