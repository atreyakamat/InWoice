import { describe, expect, it } from 'vitest';
import { gmailComposeUrl, mailtoUrl, outlookComposeUrl } from '../../../frontend/src/lib/mailLinks';

const mail = { to: 'accounts@beanthere.in', subject: 'Invoice SNV/26-27/0001 from Stix N Vibes', body: 'Hi Bean There Café,\n\nAmount due: ₹5,779 & thanks!' };

describe('send from your own mailbox: compose links', () => {
  it('Gmail opens a prefilled compose window in the chosen account', () => {
    const url = new URL(gmailComposeUrl(mail, 'owner@gmail.com'));
    expect(url.origin + url.pathname).toBe('https://mail.google.com/mail/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ authuser: 'owner@gmail.com', view: 'cm', fs: '1', to: mail.to, su: mail.subject, body: mail.body });
  });

  it('Gmail without an account uses whichever one is signed in', () => {
    expect(new URL(gmailComposeUrl(mail)).searchParams.has('authuser')).toBe(false);
  });

  it('Outlook on the web and mailto carry the same text, safely encoded', () => {
    const o = new URL(outlookComposeUrl(mail));
    expect(o.searchParams.get('to')).toBe(mail.to);
    expect(o.searchParams.get('body')).toBe(mail.body);
    const m = mailtoUrl(mail);
    expect(m.startsWith('mailto:accounts@beanthere.in?')).toBe(true);
    expect(decodeURIComponent(m.split('body=')[1]!)).toBe(mail.body);
    expect(m).not.toContain('&thanks'); // the "&" in the body can't break the link
  });
});
