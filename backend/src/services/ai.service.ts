import Anthropic from '@anthropic-ai/sdk';
import { config } from '../lib/config';
import { HttpError } from '../lib/errors';
import { getSettings } from './settings.service';

/**
 * Pluggable AI layer. Every AI feature in InWoice is optional: when no provider
 * is configured the callers fall back to deterministic, rule-based output.
 *
 *  - ANTHROPIC: Claude via the official SDK (needs an API key; no local compute)
 *  - OLLAMA:    a local model served by Ollama (private, offline, CPU-bound)
 *  - NONE:      AI disabled
 */
export type AiProvider = 'ANTHROPIC' | 'OLLAMA' | 'NONE';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
// Models that accept the server-side refusal fallback parameter.
const FALLBACK_CAPABLE = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-5']);

export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  ollamaUrl: string;
}

export interface AiRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface AiResult {
  text: string;
  provider: AiProvider;
  model: string;
}

export async function getAiConfig(): Promise<AiConfig> {
  const s = await getSettings();
  const apiKey = s.aiApiKey || config.anthropicApiKey;
  const ollamaUrl = (s.ollamaUrl || config.ollamaUrl || '').replace(/\/+$/, '');
  let provider = (s.aiProvider as AiProvider) || 'NONE';
  // Environment-only setups: enable Claude automatically when a key is present.
  if (provider === 'NONE' && !s.aiModel && config.anthropicApiKey) provider = 'ANTHROPIC';

  const model =
    s.aiModel || (provider === 'OLLAMA' ? config.ollamaModel : provider === 'ANTHROPIC' ? DEFAULT_CLAUDE_MODEL : '');
  return { provider, model, apiKey, ollamaUrl };
}

export async function isAiEnabled(): Promise<boolean> {
  const c = await getAiConfig();
  if (c.provider === 'ANTHROPIC') return Boolean(c.apiKey);
  if (c.provider === 'OLLAMA') return Boolean(c.ollamaUrl);
  return false;
}

let cachedClient: { key: string; client: Anthropic } | null = null;
function anthropicClient(apiKey: string): Anthropic {
  if (cachedClient?.key !== apiKey) {
    cachedClient = { key: apiKey, client: new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 }) };
  }
  return cachedClient.client;
}

async function callAnthropic(c: AiConfig, req: AiRequest): Promise<string> {
  if (!c.apiKey) throw new HttpError(400, 'Claude is selected but no API key is configured (Settings > AI).');
  const client = anthropicClient(c.apiKey);
  const useFallback = FALLBACK_CAPABLE.has(c.model);
  try {
    const response = await client.beta.messages.create({
      model: c.model,
      max_tokens: req.maxTokens ?? 4000,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      // Business Q&A and briefings are short, routine tasks: low effort keeps
      // latency and cost down without hurting answer quality.
      output_config: { effort: 'low' },
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'The AI declined to answer this request.');
    }
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!text) throw new HttpError(502, 'The AI returned an empty response.');
    return text;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(400, 'Claude API key is invalid.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new HttpError(400, 'Claude API key lacks access to this model.');
    if (err instanceof Anthropic.NotFoundError) throw new HttpError(400, `Unknown Claude model "${c.model}".`);
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Claude rate limit reached. Try again shortly.');
    if (err instanceof Anthropic.BadRequestError) throw new HttpError(400, `Claude rejected the request: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new HttpError(502, 'Could not reach the Claude API. Check internet access.');
    if (err instanceof Anthropic.APIError) throw new HttpError(502, `Claude API error (${err.status ?? 'unknown'}).`);
    throw err;
  }
}

async function callOllama(c: AiConfig, req: AiRequest): Promise<string> {
  if (!c.ollamaUrl) throw new HttpError(400, 'Local AI is selected but no Ollama URL is configured.');
  let res: Response;
  try {
    res = await fetch(`${c.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: c.model,
        stream: false,
        // Small context + capped output keeps CPU-only inference responsive.
        options: { num_ctx: 4096, num_predict: Math.min(req.maxTokens ?? 800, 1200), temperature: 0.3 },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'is not reachable';
    throw new HttpError(502, `Local AI (Ollama at ${c.ollamaUrl}) ${reason}. Is Ollama running?`);
  }
  if (res.status === 404) {
    throw new HttpError(400, `Model "${c.model}" is not installed in Ollama. Run: ollama pull ${c.model}`);
  }
  if (!res.ok) throw new HttpError(502, `Local AI error: HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content?.trim();
  if (!text) throw new HttpError(502, 'Local AI returned an empty response.');
  return text;
}

/** Run a single prompt through the configured provider. Throws if AI is disabled. */
export async function generate(req: AiRequest, override?: Partial<AiConfig>): Promise<AiResult> {
  const c = { ...(await getAiConfig()), ...override };
  if (c.provider === 'ANTHROPIC') return { text: await callAnthropic(c, req), provider: c.provider, model: c.model };
  if (c.provider === 'OLLAMA') return { text: await callOllama(c, req), provider: c.provider, model: c.model };
  throw new HttpError(400, 'AI is turned off. Choose Claude or Local AI in Settings > AI.');
}

/** Extract the first JSON value from a model reply (models sometimes wrap JSON in prose or fences). */
export function parseJsonFromText<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  for (let end = candidate.length; end > start; end--) {
    const ch = candidate[end - 1];
    if (ch !== '}' && ch !== ']') continue;
    try {
      return JSON.parse(candidate.slice(start, end)) as T;
    } catch {
      /* keep shrinking */
    }
  }
  return null;
}

// --- Reading documents (bills, receipts) -------------------------------------------

export interface DocumentInput {
  mimeType: string; // image/jpeg, image/png, image/webp, image/gif or application/pdf
  data: Buffer;
}

export interface ExtractRequest {
  system: string;
  prompt: string;
  /** JSON Schema the answer must follow (all properties required, no extras). */
  schema: Record<string, unknown>;
  document: DocumentInput;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * Read a photo or PDF and return JSON matching `schema`. Claude reads images and PDFs and
 * is held to the schema by structured outputs; a local Ollama vision model (e.g.
 * qwen2.5vl, llava) reads images only.
 */
export async function extractFromDocument(req: ExtractRequest): Promise<{ data: unknown; provider: AiProvider; model: string }> {
  const c = await getAiConfig();
  const isPdf = req.document.mimeType === 'application/pdf';
  const isImage = (IMAGE_TYPES as readonly string[]).includes(req.document.mimeType);
  if (!isPdf && !isImage) throw new HttpError(400, 'Upload a photo (JPEG, PNG, WebP) or a PDF');
  const b64 = req.document.data.toString('base64');

  if (c.provider === 'ANTHROPIC') {
    if (!c.apiKey) throw new HttpError(400, 'Claude is selected but no API key is configured (Settings > AI).');
    const client = anthropicClient(c.apiKey);
    const useFallback = FALLBACK_CAPABLE.has(c.model);
    try {
      const response = await client.beta.messages.create({
        model: c.model,
        max_tokens: 16000,
        system: req.system,
        messages: [
          {
            role: 'user',
            content: [
              isPdf
                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
                : { type: 'image', source: { type: 'base64', media_type: req.document.mimeType as (typeof IMAGE_TYPES)[number], data: b64 } },
              { type: 'text', text: req.prompt },
            ],
          },
        ],
        // Reading a printed bill is careful but routine work.
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: req.schema } },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
      if (response.stop_reason === 'refusal') throw new HttpError(422, 'The AI declined to read this document.');
      if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'The document was too long to read in one go.');
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { data: JSON.parse(text), provider: c.provider, model: response.model };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof SyntaxError) throw new HttpError(502, 'The AI did not return readable data. Try a clearer photo.');
      if (err instanceof Anthropic.AuthenticationError) throw new HttpError(400, 'Claude API key is invalid.');
      if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Claude rate limit reached. Try again shortly.');
      if (err instanceof Anthropic.BadRequestError) throw new HttpError(400, `Claude rejected the request: ${err.message}`);
      if (err instanceof Anthropic.APIConnectionError) throw new HttpError(502, 'Could not reach the Claude API. Check internet access.');
      if (err instanceof Anthropic.APIError) throw new HttpError(502, `Claude API error (${err.status ?? 'unknown'}).`);
      throw err;
    }
  }

  if (c.provider === 'OLLAMA') {
    if (!c.ollamaUrl) throw new HttpError(400, 'Local AI is selected but no Ollama URL is configured.');
    if (isPdf) throw new HttpError(400, 'Local AI can read photos but not PDFs. Upload a photo or screenshot of the bill, or use Claude.');
    let res: Response;
    try {
      res = await fetch(`${c.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: c.model,
          stream: false,
          format: req.schema, // Ollama constrains the reply to this JSON schema
          options: { num_ctx: 8192, temperature: 0 },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.prompt, images: [b64] },
          ],
        }),
        signal: AbortSignal.timeout(300_000),
      });
    } catch {
      throw new HttpError(502, `Local AI (Ollama at ${c.ollamaUrl}) is not reachable or took too long.`);
    }
    if (res.status === 404) throw new HttpError(400, `Model "${c.model}" is not installed in Ollama. Use a vision model, e.g. ollama pull qwen2.5vl`);
    if (!res.ok) throw new HttpError(502, `Local AI error: HTTP ${res.status}`);
    const body = (await res.json()) as { message?: { content?: string } };
    const parsed = parseJsonFromText<unknown>(body.message?.content ?? '');
    if (parsed === null) throw new HttpError(502, 'Local AI did not return readable data. Try a clearer photo or a vision model.');
    return { data: parsed, provider: c.provider, model: c.model };
  }

  throw new HttpError(400, 'Reading bills needs AI. Choose Claude or Local AI in Settings > AI.');
}
