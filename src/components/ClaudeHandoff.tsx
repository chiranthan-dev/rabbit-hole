import { useRef, useState } from 'react';
import { Copy01Icon, ArrowUpRight01Icon, Upload01Icon } from '@hugeicons/core-free-icons';
import { Icon, toast } from './ui';
import { copyText, handOffToClaude } from '../lib/manual';

/**
 * The copy → Claude → paste-back loop.
 * If `onSubmit` is given, shows a paste box + file upload for the reply.
 */
export function ClaudeHandoff({
  prompt,
  onSubmit,
  submitLabel = 'Use this',
  steps = true,
  pastePlaceholder = 'Paste Claude’s whole reply here…',
  compact = false,
}: {
  prompt: string;
  onSubmit?: (text: string) => void | Promise<void>;
  submitLabel?: string;
  steps?: boolean;
  pastePlaceholder?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (value: string) => {
    if (!onSubmit) return;
    setError('');
    setBusy(true);
    try {
      await onSubmit(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: compact ? 10 : 14 }}>
      {steps && (
        <ol className="small grey" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>
            Copy the prompt and open Claude (turn on <b>web search</b> in Claude for real sources).
          </li>
          <li>Send it, and wait for Claude to finish.</li>
          {onSubmit && <li>Copy Claude’s reply — or download the file it gives you — and bring it back here.</li>}
        </ol>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <button
          className="btn primary"
          onClick={async () => {
            const ok = await handOffToClaude(prompt);
            toast(ok ? 'Prompt copied — paste it into Claude.' : 'Opened Claude. Copy the prompt below by hand.');
            if (!ok) setShowPrompt(true);
          }}
        >
          <Icon icon={ArrowUpRight01Icon} size={14} /> Copy prompt & open Claude
        </button>
        <button
          className="btn"
          onClick={async () => {
            const ok = await copyText(prompt);
            toast(ok ? 'Prompt copied.' : 'Couldn’t copy automatically — select it below.');
            if (!ok) setShowPrompt(true);
          }}
        >
          <Icon icon={Copy01Icon} size={14} /> Copy only
        </button>
        <button className="btn ghost sm" onClick={() => setShowPrompt((s) => !s)}>
          {showPrompt ? 'Hide prompt' : 'See prompt'}
        </button>
      </div>
      {showPrompt && (
        <textarea className="textarea code" readOnly value={prompt} style={{ minHeight: 180 }} onFocus={(e) => e.currentTarget.select()} />
      )}
      {onSubmit && (
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="textarea" style={{ minHeight: compact ? 90 : 140 }} placeholder={pastePlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn primary" disabled={!text.trim() || busy} onClick={() => submit(text)}>
              {busy ? 'Reading…' : submitLabel}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon icon={Upload01Icon} size={14} /> Upload Claude’s file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.txt,.md,application/json,text/plain,text/markdown"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const content = await f.text();
                setText(content);
                submit(content);
              }}
            />
          </div>
          {error && (
            <div className="code" style={{ borderColor: 'rgba(255,155,155,.5)' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
