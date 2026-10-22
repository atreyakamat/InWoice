import axios, { AxiosError } from 'axios';

/** All requests go to same-origin /api (Vite proxies it in dev; the backend serves the app in prod). */
export const http = axios.create({ baseURL: '/api', timeout: 120_000 });

const TOKEN_KEY = 'inwoice_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* private mode */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Session expired: drop the token and bounce to login (except for the login call itself).
http.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/setup')) {
      tokenStore.clear();
      // Public pages (customer portal, password reset) never need a session.
      const publicPage = /^\/(login|portal\/|forgot-password|reset-password)/.test(window.location.pathname);
      if (!publicPage) window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Human-readable message from any API error. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.code === 'ECONNABORTED') return 'The request timed out.';
    if (!err.response) return 'Cannot reach the server. Is the backend running?';
    return `Request failed (${err.response.status})`;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

// Thin typed helpers: the API wraps payloads as { success, data }.
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return (await http.get(url, { params })).data.data as T;
}
export async function post<T>(url: string, body?: unknown): Promise<T> {
  return (await http.post(url, body)).data.data as T;
}
export async function put<T>(url: string, body?: unknown): Promise<T> {
  return (await http.put(url, body)).data.data as T;
}
export async function patch<T>(url: string, body?: unknown): Promise<T> {
  return (await http.patch(url, body)).data.data as T;
}
export async function del(url: string): Promise<string | undefined> {
  return (await http.delete(url)).data.message as string | undefined;
}

/** Download a binary/CSV endpoint through the authenticated client (tokens never go in URLs). */
export async function downloadFile(url: string, filename: string) {
  const res = await http.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Open a PDF in a new tab via a blob URL. */
export async function openPdf(url: string) {
  const win = window.open('', '_blank');
  let res;
  try {
    res = await http.get(url, { responseType: 'blob' });
  } catch (err) {
    win?.close();
    throw err;
  }
  const href = URL.createObjectURL(res.data as Blob);
  if (win) win.location.href = href;
  else window.location.href = href;
}
