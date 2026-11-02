import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download01Icon, Upload01Icon, Search01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Icon, Range, toast } from '../components/ui';
import { defaultAI, exportData, useStore } from '../lib/store';
import { detectLocal, ollamaModels, openaiModels, testConnection } from '../lib/ai/providers';
import type { AISettings, ProviderKind } from '../lib/types';
import { downloadText, isoDate } from '../lib/util';

const PROVIDERS: { id: ProviderKind; label: string; text: string }[] = [
  { id: 'manual', label: 'Claude.ai — copy & paste', text: 'Recommended. Claude researches the web using your own Claude account; you paste its reply back. No keys, no cost, works on phone.' },
  { id: 'ollama', label: 'Ollama (local)', text: 'Runs Qwen on your laptop. Only works when you run the app locally (npm run dev).' },
  { id: 'openai', label: 'OpenAI-compatible', text: 'LM Studio, llama.cpp, OpenAI, Groq, OpenRouter…' },
  { id: 'anthropic', label: 'Claude API (automatic)', text: 'Same quality, no copy-paste — but needs an API key and is billed per use.' },
  { id: 'offline', label: 'Offline', text: 'No AI. Plans come from the built-in library templates.' },
];

const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — best' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — fast & cheaper' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — cheapest' },
];

export default function Settings() {
  const ai = useStore((s) => s.ai);
  const setAI = useStore((s) => s.setAI);
  const ui = useStore((s) => s.ui);
  const setUI = useStore((s) => s.setUI);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const importData = useStore((s) => s.importData);
  const resetAll = useStore((s) => s.resetAll);
  const nav = useNavigate();
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = <K extends keyof AISettings>(k: K, v: Partial<AISettings[K]> | AISettings[K]) =>
    setAI({ [k]: typeof v === 'object' ? { ...(ai[k] as object), ...(v as object) } : v } as Partial<AISettings>);

  const loadModels = async () => {
    try {
      const list = ai.provider === 'ollama' ? await ollamaModels(ai.ollama.baseUrl) : await openaiModels(ai.openai.baseUrl, ai.openai.apiKey);
      setModels(list);
      toast(list.length ? `Found ${list.length} model(s).` : 'Server is up but has no models.');
    } catch (e) {
      setModels([]);
      toast(`Couldn’t list models: ${(e as Error).message}`);
    }
  };

  const detect = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const found = await detectLocal();
      if (!found.length) {
        setStatus({ ok: false, text: 'No local model server found on the usual ports (Ollama 11434, LM Studio 1234). Is it running?' });
        return;
      }
      const f = found[0];
      const qwen = f.models.find((m) => /qwen/i.test(m)) ?? f.models[0];
      if (f.provider === 'ollama') setAI({ provider: 'ollama', ollama: { baseUrl: f.baseUrl, model: qwen ?? ai.ollama.model } });
      else setAI({ provider: 'openai', openai: { ...ai.openai, baseUrl: f.baseUrl, model: qwen ?? ai.openai.model } });
      setModels(f.models);
      setStatus({ ok: true, text: `Found ${f.provider === 'ollama' ? 'Ollama' : 'an OpenAI-compatible server'} at ${f.baseUrl} with ${f.models.length} model(s). Using ${qwen ?? 'the default'}.` });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ ok: true, text: await testConnection(useStore.getState().ai) });
    } catch (e) {
      const err = e as Error & { hint?: string };
      setStatus({ ok: false, text: `${err.message}${err.hint ? `\n${err.hint}` : ''}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack xl" style={{ maxWidth: 860 }}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">Settings</div>
        <h1 className="display sm">Settings</h1>
      </div>

      <section className="card stack lg">
        <div className="stack" style={{ gap: 4 }}>
          <div className="h2">AI engine</div>
          <div className="small muted">Everything that researches, plans, quizzes and gives feedback goes through this one setting — swap it any time.</div>
        </div>
        <div className="grid two">
          {PROVIDERS.map((p) => (
            <button key={p.id} className={`card tight stack${ai.provider === p.id ? ' hot' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', gap: 4 }} onClick={() => setAI({ provider: p.id })}>
              <span className="h3">{p.label}</span>
              <span className="small muted">{p.text}</span>
            </button>
          ))}
        </div>

        {ai.provider === 'ollama' && (
          <div className="stack">
            <label className="field">
              Server URL
              <input className="input" value={ai.ollama.baseUrl} onChange={(e) => patch('ollama', { baseUrl: e.target.value })} />
              <span className="tiny faint">
                <span className="kbd">/ollama</span> goes through the app’s dev server (no CORS setup needed). Use <span className="kbd">http://localhost:11434</span> to call Ollama directly.
              </span>
            </label>
            <ModelField value={ai.ollama.model} models={models} onChange={(m) => patch('ollama', { model: m })} onRefresh={loadModels} />
          </div>
        )}
        {ai.provider === 'openai' && (
          <div className="stack">
            <label className="field">
              Base URL (ending in /v1)
              <input className="input" value={ai.openai.baseUrl} onChange={(e) => patch('openai', { baseUrl: e.target.value })} />
              <span className="tiny faint">
                LM Studio: <span className="kbd">/lmstudio/v1</span> · OpenAI: <span className="kbd">https://api.openai.com/v1</span> · OpenRouter: <span className="kbd">https://openrouter.ai/api/v1</span>
              </span>
            </label>
            <label className="field">
              API key (blank for local servers)
              <input className="input" type="password" value={ai.openai.apiKey} onChange={(e) => patch('openai', { apiKey: e.target.value })} />
            </label>
            <ModelField value={ai.openai.model} models={models} onChange={(m) => patch('openai', { model: m })} onRefresh={loadModels} />
          </div>
        )}
        {ai.provider === 'anthropic' && (
          <div className="stack">
            <label className="field">
              Anthropic API key
              <input className="input" type="password" placeholder="sk-ant-…" value={ai.anthropic.apiKey} onChange={(e) => patch('anthropic', { apiKey: e.target.value })} />
              <span className="tiny faint">Stored only in this browser and sent only to Anthropic. Never included in exports.</span>
            </label>
            <label className="field">
              Model
              <select className="select" value={ai.anthropic.model} onChange={(e) => patch('anthropic', { model: e.target.value })}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={ai.anthropic.webSearch} onChange={(e) => patch('anthropic', { webSearch: e.target.checked })} />
              Research on the live web before planning (real sources, slower, costs a little more)
            </label>
          </div>
        )}

        {ai.provider === 'manual' && (
          <div className="small grey stack" style={{ gap: 6 }}>
            <span>
              When you start a rabbit hole, Rabbit Hole writes a prompt with your topic and daily time. You paste it into Claude (claude.ai or the app), Claude searches the web and replies with a file, and you paste or upload it back. Turn on <b>web search</b> in Claude for real, current sources.
            </span>
            <span>Questions, explanation feedback, recaps and topic ideas work the same way.</span>
          </div>
        )}
        {ai.provider !== 'offline' && ai.provider !== 'manual' && (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row between small">
                <span className="muted">Creativity (temperature)</span>
                <span>{ai.temperature.toFixed(1)}</span>
              </div>
              <Range value={ai.temperature} min={0} max={1.2} step={0.1} onChange={(v) => setAI({ temperature: v })} />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary" disabled={busy} onClick={test}>
                <Icon icon={Tick02Icon} size={14} /> Test connection
              </button>
              {ai.provider !== 'anthropic' && (
                <button className="btn" disabled={busy} onClick={detect}>
                  <Icon icon={Search01Icon} size={14} /> Detect local models
                </button>
              )}
              <button className="btn ghost" onClick={() => setAI({ ...defaultAI, anthropic: { ...defaultAI.anthropic, apiKey: ai.anthropic.apiKey } })}>
                Reset to defaults
              </button>
            </div>
          </>
        )}
        {busy && <div className="small muted">Talking to the model…</div>}
        {status && (
          <div className="code" style={{ borderColor: status.ok ? 'rgba(143,214,148,.5)' : 'rgba(255,155,155,.5)' }}>
            {status.text}
          </div>
        )}
        <details className="small grey">
          <summary style={{ cursor: 'pointer' }}>Which model is good enough?</summary>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <span>• Small local models (Qwen 2.5 3B and below) work, but plans get generic and they sometimes break the format. The app retries and falls back to templates for any day that fails.</span>
            <span>
              • <b>Qwen 2.5 7B / Qwen 3 8B</b> is the practical minimum for good weekly plans. <b>Qwen 2.5 14B / Qwen 3 14B</b> are noticeably better if your laptop has the memory (≈10 GB+).
            </span>
            <span>• Local models only know what they were trained on. Claude with web research gives the best quality and real, current sources.</span>
            <span>
              • To pull a model: <span className="kbd">ollama pull qwen2.5:7b</span>
            </span>
          </div>
        </details>
      </section>

      <section className="card stack lg">
        <div className="h2">You</div>
        <div className="grid two">
          <label className="field">
            Name
            <input className="input" value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} />
          </label>
          <label className="field">
            Default minutes per day
            <input className="input" type="number" min={5} max={480} value={profile.defaultMinutes} onChange={(e) => setProfile({ defaultMinutes: Number(e.target.value) || 30 })} />
          </label>
        </div>
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setProfile({ onboarded: false }); nav('/welcome'); }}>
          Redo onboarding
        </button>
      </section>

      <section className="card stack lg">
        <div className="h2">Look & feel</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted" style={{ width: 110 }}>Background</span>
          {(['animated', 'static'] as const).map((b) => (
            <button key={b} className={`chip${ui.background === b ? ' on' : ''}`} onClick={() => setUI({ background: b })}>
              {b}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted" style={{ width: 110 }}>Motion</span>
          {(['full', 'reduced'] as const).map((m) => (
            <button key={m} className={`chip${ui.motion === m ? ' on' : ''}`} onClick={() => setUI({ motion: m })}>
              {m}
            </button>
          ))}
        </div>
        <div className="tiny faint">
          Typography uses Neue Montreal if it’s installed on your device, otherwise Inter Tight. UI effects from React Bits.
        </div>
      </section>

      <section className="card stack lg">
        <div className="stack" style={{ gap: 4 }}>
          <div className="h2">Your data</div>
          <div className="small muted">Everything lives in this browser. Export a backup (API keys are never included), or move it to another device.</div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={() => downloadText(`rabbit-hole-backup-${isoDate()}.json`, exportData())}>
            <Icon icon={Download01Icon} size={14} /> Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon icon={Upload01Icon} size={14} /> Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                importData(await f.text());
                toast('Backup restored.');
              } catch (err) {
                toast((err as Error).message);
              }
              e.target.value = '';
            }}
          />
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Erase everything — holes, notes, interests and settings? This cannot be undone.')) {
                resetAll();
                nav('/welcome');
              }
            }}
          >
            Erase everything
          </button>
        </div>
      </section>
    </div>
  );
}

function ModelField({ value, models, onChange, onRefresh }: { value: string; models: string[]; onChange: (m: string) => void; onRefresh: () => void }) {
  return (
    <label className="field">
      Model
      <div className="row" style={{ gap: 8 }}>
        {models.length ? (
          <select className="select" value={models.includes(value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
            {!models.includes(value) && <option value="">{value} (not installed?)</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        <button type="button" className="btn" onClick={onRefresh}>
          List models
        </button>
      </div>
    </label>
  );
}
