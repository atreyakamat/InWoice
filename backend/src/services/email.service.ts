import nodemailer from 'nodemailer';
import type { BusinessSettings } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { badRequest, HttpError } from '../lib/errors';
import { getSettings } from './settings.service';
import { automaticSender, sendWithGmail } from './gmail.service';

function smtpConfig(s: BusinessSettings) {
  const host = s.smtpHost || config.smtp.host;
  const user = s.smtpUsername || config.smtp.user;
  const pass = s.smtpPassword || config.smtp.password;
  const port = Number(s.smtpPort || config.smtp.port || 587);
  const from = s.smtpFrom || config.smtp.from || user;
  return { host, user, pass, port, from };
}

/** SMTP is set up, or a connected Gmail is chosen for automatic emails. */
export async function isEmailConfigured() {
  const c = smtpConfig(await getSettings());
  return Boolean(c.host && c.user && c.pass) || Boolean(await automaticSender());
}

interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer }[];
  referenceType?: string;
  referenceId?: string;
  /** Send from this user's connected Gmail (they pressed Send themselves). */
  fromUserId?: string;
}

const log = (mail: Mail, status: 'SENT' | 'FAILED', errorMessage?: string) =>
  prisma.emailLog.create({ data: { toAddress: mail.to, subject: mail.subject, status, errorMessage, referenceType: mail.referenceType, referenceId: mail.referenceId } });

/**
 * Send an email: from the user's own Gmail when they asked for that, otherwise from the
 * Gmail chosen for automatic emails, otherwise through SMTP. Every attempt is logged.
 */
export async function sendMail(mail: Mail) {
  const s = await getSettings();
  const gmailUser = mail.fromUserId ?? (await automaticSender())?.userId;
  if (gmailUser) {
    try {
      const r = await sendWithGmail(gmailUser, { fromName: s.businessName, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments });
      await log(mail, 'SENT');
      return { via: 'GMAIL' as const, from: r.from };
    } catch (err) {
      await log(mail, 'FAILED', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
  const c = smtpConfig(s);
  if (!c.host || !c.user || !c.pass) {
    throw badRequest('Email is not configured. Connect Gmail or add SMTP details in Settings › Email.');
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
    await log(mail, 'SENT');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log(mail, 'FAILED', message);
    throw new HttpError(502, `Email could not be sent: ${message}`);
  }
  return { via: 'SMTP' as const, from: c.from };
}
