import { useEffect, useState } from 'react';
import { Download, Mail, Send } from 'lucide-react';
import { Button, Field, Input, Modal, Spinner, Textarea } from './ui';
import { useToast } from './toast';
import { useAuth } from '../context/AuthContext';
import { downloadFile, get, http, post } from '../lib/api';
import { gmailComposeUrl, mailtoUrl, outlookComposeUrl, type MailDraft } from '../lib/mailLinks';

interface Composed {
  to: string;
  subject: string;
  text: string;
  pdfLink: string | null;
  fileName: string;
  issued: boolean;
}

// 'connected' = send through the user's connected Gmail (API), PDF attached.
type Via = 'connected' | 'gmail' | 'outlook' | 'app' | 'inwoice';

const FROM_KEY = 'inwoice_mail_from';
const VIA_KEY = 'inwoice_mail_via';
const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const remember = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: nothing to remember
  }
};

/**
 * Send an invoice or quote from the user's own mailbox: opens Gmail or Outlook in the
 * browser (or the computer's mail app) with the email written, from whichever account
 * they pick. The PDF can't be attached through a link, so it is downloaded for them to
 * drag in, and the message also carries a private link to it. "Send from InWoice" uses
 * the business's SMTP settings and attaches the PDF itself.
 */
export function MailComposer({
  open,
  onClose,
  kind,
  id,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'invoices' | 'quotes';
  id: string;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
  const { settings } = useAuth();
  const [draft, setDraft] = useState<(MailDraft & { pdfLink: string | null; fileName: string }) | null>(null);
  const [from, setFrom] = useState(() => read(FROM_KEY));
  const [via, setVia] = useState<Via>(() => (read(VIA_KEY) as Via) || 'gmail');
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myGmail, setMyGmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    get<Composed>(`/${kind}/${id}/compose`)
      .then((c) => live && setDraft({ to: c.to, subject: c.subject, body: c.text, pdfLink: c.pdfLink, fileName: c.fileName }))
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : String(err)));
    get<{ connected: string | null }>('/google/status')
      .then((g) => {
        if (!live) return;
        setMyGmail(g.connected);
        // A connected Gmail is the easiest way to send: pick it unless they chose otherwise before.
        if (g.connected && !read(VIA_KEY)) setVia('connected');
      })
      .catch(() => undefined);
    return () => {
      live = false;
      setDraft(null);
      setLoadError(null);
    };
  }, [open, kind, id]);

  const label = kind === 'invoices' ? 'invoice' : 'quote';

  const go = async () => {
    if (!draft) return;
    if (!draft.to.trim()) return toast.error('Enter the customer email address');
    remember(VIA_KEY, via);
    if (from.trim()) remember(FROM_KEY, from.trim());
    if (via === 'inwoice' || via === 'connected') {
      setBusy(true);
      try {
        const res = await http.post(`/${kind}/${id}/send`, { to: draft.to.trim(), subject: draft.subject, message: draft.body, via: via === 'connected' ? 'gmail' : 'default' });
        toast.success(res.data.message ?? 'Sent');
        onClose();
        await onDone();
      } catch (err) {
        toast.error(err);
      } finally {
        setBusy(false);
      }
      return;
    }
    // Open the window now, inside the click, so the browser doesn't block it as a pop-up.
    const mail = { ...draft, to: draft.to.trim() };
    const url = via === 'gmail' ? gmailComposeUrl(mail, from.trim()) : via === 'outlook' ? outlookComposeUrl(mail) : mailtoUrl(mail);
    // With a browser chosen in Settings › Email, InWoice (on this computer) opens it there.
    const inChosenBrowser = via !== 'app' && Boolean(settings?.mailBrowser);
    const win = via === 'app' || inChosenBrowser ? null : window.open('', '_blank');
    setBusy(true);
    try {
      await post(`/${kind}/${id}/compose`);
      if (attach) await downloadFile(`/${kind}/${id}/pdf?download=1`, draft.fileName);
      let where = '';
      if (inChosenBrowser) where = ` in ${(await post<{ browser: string }>('/mail/open', { url })).browser}`;
      else if (win) win.location.href = url;
      else window.location.href = url;
      toast.success(attach ? `Email opened${where}. ${draft.fileName} downloaded: drag it into the email to attach it` : `Email opened${where}`);
      onClose();
      await onDone();
    } catch (err) {
      win?.close();
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const options: { id: Via; title: string; text: string }[] = [
    ...(myGmail ? [{ id: 'connected' as const, title: 'My Gmail', text: `Sends now from ${myGmail}, PDF attached` }] : []),
    { id: 'gmail', title: 'Gmail', text: myGmail ? 'Opens Gmail to edit first' : 'Opens Gmail in your browser' },
    { id: 'outlook', title: 'Outlook', text: 'Opens Outlook on the web' },
    { id: 'app', title: 'Mail app', text: 'Your computer or phone mail app' },
    { id: 'inwoice', title: 'Send from InWoice', text: 'Uses Settings › Email, PDF attached' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Email ${label}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void go()} loading={busy} disabled={!draft}>
            {via === 'inwoice' || via === 'connected' ? <Send size={15} /> : <Mail size={15} />}
            {via === 'gmail' ? 'Open in Gmail' : via === 'outlook' ? 'Open in Outlook' : via === 'app' ? 'Open mail app' : 'Send now'}
          </Button>
        </>
      }
    >
      {loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : !draft ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className={`grid grid-cols-2 gap-2 ${options.length > 4 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`} role="radiogroup" aria-label="Send with">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={via === o.id}
                onClick={() => setVia(o.id)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${via === o.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <span className="block font-medium text-slate-900">{o.title}</span>
                <span className="block text-xs text-slate-500">{o.text}</span>
              </button>
            ))}
          </div>
          {via === 'gmail' && (
            <Field label="Send from (your Gmail address)" hint="Gmail opens in this account if you're signed in to it. Leave blank to use the account you're signed in with.">
              <Input type="email" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="you@gmail.com" />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="To">
              <Input type="email" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="customer@example.com" />
            </Field>
            <Field label="Subject">
              <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </Field>
          </div>
          <Field label="Message">
            <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="min-h-[180px]" />
          </Field>
          {via !== 'inwoice' && via !== 'connected' ? (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>
                Download the PDF so I can attach it <Download size={13} className="inline" />
                <span className="block text-xs text-slate-500">
                  {draft.pdfLink
                    ? 'The message also includes a private link to the PDF.'
                    : 'Set your public address (Settings › Business) to also include a link to the PDF.'}
                </span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-slate-500">
              The PDF is attached automatically.{via === 'inwoice' ? ' Needs Settings › Email to be set up.' : ` Sent from ${myGmail}; it appears in your Gmail Sent folder.`}
            </p>
          )}
          <p className="text-xs text-slate-500">Opening or sending a draft issues it.</p>
        </div>
      )}
    </Modal>
  );
}
