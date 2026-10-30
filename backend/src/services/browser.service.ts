import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import type { Request } from 'express';
import { config } from '../lib/config';
import { HttpError, badRequest } from '../lib/errors';
import { getSettings } from './settings.service';

/**
 * Open Gmail/Outlook in a browser of the owner's choice (and a Chrome/Edge/Brave profile,
 * i.e. which Google account). A web page can only open links in the browser it is running
 * in, so this asks the InWoice server to start the browser. That only makes sense, and is
 * only allowed, when InWoice runs on this same computer: single-business mode, request from
 * localhost, and only browsers found installed here (never an arbitrary program).
 */

export interface BrowserProfile {
  dir: string;
  name: string;
  email: string | null;
}
export interface InstalledBrowser {
  id: string;
  name: string;
  path: string;
  profiles: BrowserProfile[];
}

interface Candidate {
  id: string;
  name: string;
  paths: string[];
  userData?: string; // Chromium "User Data" folder, for profiles
}

function candidates(): Candidate[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], local].filter(Boolean) as string[];
    const under = (...rel: string[]) => pf.map((p) => path.join(p, ...rel));
    return [
      { id: 'chrome', name: 'Google Chrome', paths: under('Google', 'Chrome', 'Application', 'chrome.exe'), userData: path.join(local, 'Google', 'Chrome', 'User Data') },
      { id: 'edge', name: 'Microsoft Edge', paths: under('Microsoft', 'Edge', 'Application', 'msedge.exe'), userData: path.join(local, 'Microsoft', 'Edge', 'User Data') },
      { id: 'brave', name: 'Brave', paths: under('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), userData: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { id: 'firefox', name: 'Firefox', paths: under('Mozilla Firefox', 'firefox.exe') },
    ];
  }
  if (process.platform === 'darwin') {
    const sup = path.join(home, 'Library', 'Application Support');
    return [
      { id: 'chrome', name: 'Google Chrome', paths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], userData: path.join(sup, 'Google', 'Chrome') },
      { id: 'edge', name: 'Microsoft Edge', paths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], userData: path.join(sup, 'Microsoft Edge') },
      { id: 'brave', name: 'Brave', paths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'], userData: path.join(sup, 'BraveSoftware', 'Brave-Browser') },
      { id: 'firefox', name: 'Firefox', paths: ['/Applications/Firefox.app/Contents/MacOS/firefox'] },
      { id: 'safari', name: 'Safari', paths: ['/Applications/Safari.app/Contents/MacOS/Safari'] },
    ];
  }
  const cfg = path.join(home, '.config');
  return [
    { id: 'chrome', name: 'Google Chrome', paths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'], userData: path.join(cfg, 'google-chrome') },
    { id: 'chromium', name: 'Chromium', paths: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'], userData: path.join(cfg, 'chromium') },
    { id: 'edge', name: 'Microsoft Edge', paths: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'], userData: path.join(cfg, 'microsoft-edge') },
    { id: 'brave', name: 'Brave', paths: ['/usr/bin/brave-browser'], userData: path.join(cfg, 'BraveSoftware', 'Brave-Browser') },
    { id: 'firefox', name: 'Firefox', paths: ['/usr/bin/firefox'] },
  ];
}

/** Profiles of a Chromium browser, with the Google account each is signed in to. */
export function readChromiumProfiles(localStateJson: string): BrowserProfile[] {
  try {
    const cache = (JSON.parse(localStateJson)?.profile?.info_cache ?? {}) as Record<string, { name?: string; user_name?: string; gaia_name?: string }>;
    return Object.entries(cache)
      .map(([dir, p]) => ({ dir, name: p.name || p.gaia_name || dir, email: p.user_name || null }))
      .sort((a, b) => (a.dir === 'Default' ? -1 : b.dir === 'Default' ? 1 : a.dir.localeCompare(b.dir, undefined, { numeric: true })));
  } catch {
    return [];
  }
}

export function installedBrowsers(): InstalledBrowser[] {
  const out: InstalledBrowser[] = [];
  for (const c of candidates()) {
    const exe = c.paths.find((p) => fs.existsSync(p));
    if (!exe) continue;
    let profiles: BrowserProfile[] = [];
    if (c.userData) {
      try {
        profiles = readChromiumProfiles(fs.readFileSync(path.join(c.userData, 'Local State'), 'utf8'));
      } catch {
        profiles = [];
      }
    }
    out.push({ id: c.id, name: c.name, path: exe, profiles });
  }
  return out;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Browser launching is for InWoice on this computer only. */
export function isLocalRequest(req: Request) {
  if (config.multiTenant) return false;
  if (req.headers['x-forwarded-for'] || req.headers['forwarded']) return false; // came through a proxy
  const host = (req.hostname || '').toLowerCase();
  return LOOPBACK.has(req.socket.remoteAddress ?? '') && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost'));
}

const ALLOWED_HOSTS = new Set(['mail.google.com', 'outlook.office.com', 'outlook.live.com']);

/** Start the chosen browser with a mail compose URL. */
export async function openMailInBrowser(req: Request, url: string) {
  if (!isLocalRequest(req)) throw new HttpError(403, 'Opening a chosen browser only works when InWoice runs on this computer');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest('Not a valid address');
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) throw badRequest('Only Gmail and Outlook addresses can be opened this way');
  const s = await getSettings();
  if (!s.mailBrowser) throw badRequest('Choose a browser in Settings › Email first');
  const browser = installedBrowsers().find((b) => b.id === s.mailBrowser);
  if (!browser) throw badRequest('The chosen browser is no longer installed. Pick another one in Settings › Email.');
  const args: string[] = [];
  if (s.mailBrowserProfile && browser.profiles.some((p) => p.dir === s.mailBrowserProfile)) args.push(`--profile-directory=${s.mailBrowserProfile}`);
  if (browser.id === 'firefox') args.push('-new-tab');
  args.push(parsed.toString());
  await new Promise<void>((resolve, reject) => {
    const child = spawn(browser.path, args, { detached: true, stdio: 'ignore', shell: false, windowsHide: false });
    child.once('error', (err) => reject(new HttpError(500, `Could not start ${browser.name}: ${err.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
  return { browser: browser.name, profile: s.mailBrowserProfile ?? null };
}
