/** Links that open a prefilled email in the user's own mail service. */

export interface MailDraft {
  to: string;
  subject: string;
  body: string;
}

const q = (params: Record<string, string>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

/** Gmail compose in the browser. `account` picks which signed-in Gmail account it opens in. */
export function gmailComposeUrl(m: MailDraft, account = '') {
  return `https://mail.google.com/mail/?${q({ authuser: account, view: 'cm', fs: '1', to: m.to, su: m.subject, body: m.body })}`;
}

/** Outlook on the web (works for both work/school and personal Microsoft accounts). */
export function outlookComposeUrl(m: MailDraft) {
  return `https://outlook.office.com/mail/deeplink/compose?${q({ to: m.to, subject: m.subject, body: m.body })}`;
}

/** The device's default mail app. */
export function mailtoUrl(m: MailDraft) {
  return `mailto:${encodeURIComponent(m.to).replace(/%40/g, '@')}?${q({ subject: m.subject, body: m.body })}`;
}
