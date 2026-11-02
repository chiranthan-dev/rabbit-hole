// Provider-agnostic LLM access. Everything in the app calls `chatJSON` and
// never cares which model is behind it, so upgrading from a local Qwen to a
// hosted model is a settings change, not a code change.

import type Anthropic from '@anthropic-ai/sdk';
import type { AISettings } from '../types';

export interface ChatRequest {
  system: string;
  user: string;
  /** JSON Schema the answer must follow. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** Allow the provider to research on the web first (Claude only). */
  research?: boolean;
  signal?: AbortSignal;
}

export class AIError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

// ---------------- JSON helpers ----------------

export function extractJSON(text: string): unknown {
  let s = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const tryParse = (x: string) => {
    try {
      return JSON.parse(x);
    } catch {
      return undefined;
    }
  };
  let v = tryParse(s);
  if (v !== undefined) return v;
  const start = s.search(/[[{]/);
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    const body = s.slice(start, end + 1);
    v = tryParse(body);
    if (v !== undefined) return v;
    // Common small-model slip: trailing commas.
    v = tryParse(body.replace(/,\s*([}\]])/g, '$1'));
    if (v !== undefined) return v;
  }
  throw new AIError('The model replied, but not with valid JSON.', 'Try again, or pick a larger model in Settings.');
}

const jsonInstruction = (schema: Record<string, unknown>) =>
  `\n\nRespond with ONLY a JSON object matching this JSON Schema — no prose, no markdown:\n${JSON.stringify(schema)}`;

// ---------------- Ollama ----------------

async function ollamaChat(s: AISettings, req: ChatRequest): Promise<unknown> {
  const base = s.ollama.baseUrl.replace(/\/$/, '');
  // Thinking models (Qwen 3, DeepSeek-R1…) are much faster with thinking off for structured output.
  const thinking = /qwen3|deepseek-r1|think/i.test(s.ollama.model);
  const body = (format: unknown) =>
    JSON.stringify({
      model: s.ollama.model,
      stream: false,
      format,
      ...(thinking ? { think: false } : {}),
      options: { temperature: s.temperature, num_ctx: 8192, num_predict: req.maxTokens ?? 4096 },
      messages: [
        { role: 'system', content: req.system + jsonInstruction(req.schema) },
        { role: 'user', content: req.user },
      ],
    });
  let res: Response;
  try {
    const call = (format: unknown) =>
      fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: req.signal, body: body(format) });
    res = await call(req.schema);
    // Ollama older than 0.5 only understands format: "json".
    if (res.status === 400) res = await call('json');
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError(
      `Couldn't reach Ollama at ${base}.`,
      'Make sure Ollama is running (`ollama serve`) and the URL in Settings is right. When running the app with `npm run dev`, the URL `/ollama` avoids browser CORS issues.',
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404 && body.includes('model'))
      throw new AIError(`Ollama doesn't have the model "${s.ollama.model}".`, `Run \`ollama pull ${s.ollama.model}\` or choose an installed model in Settings.`);
    throw new AIError(`Ollama error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return extractJSON(data?.message?.content ?? '');
}

export async function ollamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.models ?? []).map((m: { name: string }) => m.name);
}

// ---------------- OpenAI-compatible (LM Studio, OpenAI, Groq, OpenRouter…) ----------------

async function openaiChat(s: AISettings, req: ChatRequest): Promise<unknown> {
  const base = s.openai.baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (s.openai.apiKey) headers.Authorization = `Bearer ${s.openai.apiKey}`;
  const body = (withFormat: boolean) =>
    JSON.stringify({
      model: s.openai.model,
      temperature: s.temperature,
      max_tokens: req.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: req.system + jsonInstruction(req.schema) },
        { role: 'user', content: req.user },
      ],
      ...(withFormat
        ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: req.schema, strict: false } } }
        : {}),
    });
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: body(true), signal: req.signal });
    // Some servers don't support json_schema — retry without it and rely on the prompt.
    if (res.status === 400 || res.status === 422)
      res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: body(false), signal: req.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError(`Couldn't reach ${base}.`, 'Check the server is running and allows browser (CORS) requests. For LM Studio, use `/lmstudio/v1` while running via `npm run dev`.');
  }
  if (!res.ok) throw new AIError(`Model server error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return extractJSON(data?.choices?.[0]?.message?.content ?? '');
}

export async function openaiModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((m: { id: string }) => m.id);
}

// ---------------- Anthropic (Claude) ----------------

const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

function textOf(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

async function anthropicChat(s: AISettings, req: ChatRequest): Promise<unknown> {
  if (!s.anthropic.apiKey) throw new AIError('No Anthropic API key set.', 'Add your key in Settings → AI engine.');
  // The key stays on this device; the browser talks to the API directly.
  // Loaded on demand so local-only users don't download the SDK.
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSDK({ apiKey: s.anthropic.apiKey, dangerouslyAllowBrowser: true });
  const model = s.anthropic.model;
  const fallback = FALLBACK_MODELS.has(model)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
    : {};

  try {
    let userContent = req.user;
    // Step 1 (optional): live web research, returned as notes.
    if (req.research && s.anthropic.webSearch) {
      const research = await client.beta.messages.create(
        {
          model,
          max_tokens: 8000,
          system:
            'You are a research assistant. Search the web for accurate, up-to-date, high-quality material on the topic and return concise research notes: key ideas, surprising facts, notable debates and the best beginner-friendly sources (with titles).',
          messages: [{ role: 'user', content: req.user }],
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
          output_config: { effort: 'medium' },
          ...fallback,
        } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        { signal: req.signal },
      );
      const notes = textOf(research.content as unknown as Anthropic.Messages.ContentBlock[]);
      if (notes) userContent = `${req.user}\n\nResearch notes gathered from the web:\n${notes}`;
    }

    // Step 2: structured answer constrained to the schema.
    const msg = await client.beta.messages.create(
      {
        model,
        max_tokens: req.maxTokens ? Math.max(req.maxTokens, 4000) : 16000,
        system: req.system,
        messages: [{ role: 'user', content: userContent }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: req.schema } },
        ...fallback,
      } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
      { signal: req.signal },
    );
    if (msg.stop_reason === 'refusal') throw new AIError('Claude declined this request.', 'Try rephrasing the topic.');
    return extractJSON(textOf(msg.content as unknown as Anthropic.Messages.ContentBlock[]));
  } catch (e) {
    if (e instanceof AIError || (e as Error).name === 'AbortError') throw e;
    if (e instanceof AnthropicSDK.AuthenticationError) throw new AIError('Your Anthropic API key was rejected.', 'Check the key in Settings.');
    if (e instanceof AnthropicSDK.RateLimitError) throw new AIError('Rate limited by Anthropic.', 'Wait a minute and try again.');
    if (e instanceof AnthropicSDK.APIError) throw new AIError(`Anthropic error: ${e.message}`);
    throw new AIError(`Couldn't reach Anthropic: ${(e as Error).message}`);
  }
}

// ---------------- public ----------------

export async function chatJSON<T = unknown>(s: AISettings, req: ChatRequest, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      switch (s.provider) {
        case 'ollama':
          return (await ollamaChat(s, req)) as T;
        case 'openai':
          return (await openaiChat(s, req)) as T;
        case 'anthropic':
          return (await anthropicChat(s, req)) as T;
        default:
          throw new AIError('AI is switched off (offline mode).');
      }
    } catch (e) {
      lastErr = e;
      // Only retry malformed output, not connection/auth problems.
      if (!(e instanceof AIError) || !/valid JSON/.test(e.message)) throw e;
    }
  }
  throw lastErr;
}

export const providerLabel = (s: AISettings) =>
  s.provider === 'ollama'
    ? `Ollama · ${s.ollama.model}`
    : s.provider === 'openai'
      ? `OpenAI-compatible · ${s.openai.model}`
      : s.provider === 'anthropic'
        ? `Claude · ${s.anthropic.model}`
        : 'Offline library';

export const aiEnabled = (s: AISettings) => s.provider !== 'offline';

/** Quick health check used by Settings. */
export async function testConnection(s: AISettings): Promise<string> {
  const t0 = performance.now();
  const out = await chatJSON<{ ok: boolean; word: string }>(
    s,
    {
      system: 'You are a connection test.',
      user: 'Reply with ok=true and one interesting English word.',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, word: { type: 'string' } },
        required: ['ok', 'word'],
        additionalProperties: false,
      },
      maxTokens: 200,
    },
    0,
  );
  const ms = Math.round(performance.now() - t0);
  return `Connected in ${(ms / 1000).toFixed(1)}s — the model says “${out.word}”.`;
}

/** Try the usual local servers and report what's there. */
export async function detectLocal(): Promise<{ provider: 'ollama' | 'openai'; baseUrl: string; models: string[] }[]> {
  const found: { provider: 'ollama' | 'openai'; baseUrl: string; models: string[] }[] = [];
  for (const baseUrl of ['/ollama', 'http://localhost:11434']) {
    try {
      const models = await ollamaModels(baseUrl);
      found.push({ provider: 'ollama', baseUrl, models });
      break;
    } catch {
      /* not there */
    }
  }
  for (const baseUrl of ['/lmstudio/v1', 'http://localhost:1234/v1']) {
    try {
      const models = await openaiModels(baseUrl);
      found.push({ provider: 'openai', baseUrl, models });
      break;
    } catch {
      /* not there */
    }
  }
  return found;
}
