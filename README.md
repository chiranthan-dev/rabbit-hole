# Rabbit Hole

**One topic. One week. Real understanding.**

Rabbit Hole is a weekly learning challenge. You pick something you're curious about and say how much time you have each day. Rabbit Hole researches the topic and builds a 7‑day plan of small, achievable tasks. The plan is designed so you *understand* the topic, not just tick boxes. It also learns what you're into and keeps suggesting rabbit holes you'd never have thought of yourself.

## Quick start

You need **Node 20+**. For AI planning you also need **[Ollama](https://ollama.com)** with a Qwen model (or see *AI engines* below).

```bash
npm install
```

```bash
ollama pull qwen2.5:7b
```

```bash
npm run dev
```

Open <http://localhost:5173>. Onboarding takes about 30 seconds. Then go to **Settings → Detect local models**, then **Test connection**.

No Ollama? Pick **Offline** in Settings. The app still works and builds plans from its built-in library and templates.

To run a production build instead:

```bash
npm run build
```

```bash
npm run preview
```

Preview serves on port 4173 and keeps the `/ollama` proxy working.

## What's in v1

**The week**
- A wizard: topic → your angle → depth (curious / committed / obsessed) → learning style → minutes **for each day** (rest days, weekend boost) → research and plan → review → start.
- A fixed 7‑day learning arc: *Lay of the land → Foundations → How it works → Hands on → Stories & arguments → Your own tunnel → Teach it back*.
- Each task has a description, a **why** (how it builds understanding), a **checkpoint question** you should be able to answer afterwards, and resource **search links**. The app never shows model-invented URLs.
- Plans always fit your time. Model output is resized to your budget, and extra tasks become *bonus*.

**Understanding, not completion**
- After ticking a task, rate it *Fuzzy / Getting it / Clicked* and answer the checkpoint. **Fuzzy automatically schedules a 10‑minute spaced revisit tomorrow.**
- Key ideas tracker (new → fuzzy → clear), common misconceptions and guiding questions.
- **Practice:** AI quizzes that test understanding (or offline recall cards) and a **Feynman "explain it like I'm 12"** box with feedback.
- **Curiosity log:** park questions instead of getting derailed. The AI can answer them, and unresolved ones become future rabbit holes.
- End-of-day notes, a journal, a focus timer on every task, and an end-of-week wrap-up (hold-to-finish), AI recap and Markdown export.

**Life happens**
- **Rebalance:** moves unfinished tasks from past days to the days that have room.
- **Change my time:** resize the rest of the week. **Replan:** regenerate any single day with AI.

**Discovery & the interest algorithm** (`src/lib/recommend.ts`)
- 70 hand-picked topics across 17 domains, each tagged with cross-cutting themes (systems, perception, networks…).
- Every suggestion is one of three kinds, and the card says why it was picked:
  - **Down your alley:** high affinity with the domains and themes you like.
  - **One hop over:** a *bridge* into a domain you barely know, through a theme that often appears alongside one you love.
  - **Wildcard:** deliberately far from your profile, favouring domains you've never explored, with seeded randomness.
- The **adventurousness** slider sets the mix. Signals that train it: onboarding picks, ♥, save, ✕ dismiss (30‑day cooldown), starting a hole, your final rating and "go deeper". Topics you've seen a lot fade so new ones come up.
- **AI suggestions** read your interest profile and invent topics outside the library. **Threads** turn your parked questions and "side tunnels" into new holes.
- The **You** page shows your interest map, the themes you gravitate to, domains you've never visited, and stats (streak, minutes, ideas you can explain).

**Phone view:** `/m` is the minimal checklist. Swipe a task left to finish it, tap it for details. It's an installable PWA, and the manifest opens straight to `/m`.

## AI engines: is Qwen good enough?

All AI calls go through one interface (`src/lib/ai/providers.ts`). Changing engines is a setting, not a code change.

| Engine | Setup | Quality |
|---|---|---|
| **Ollama** (default) | `ollama pull qwen2.5:7b`, URL `/ollama` | 7B/8B works; **Qwen 2.5 14B / Qwen 3 14B** are noticeably better if you have ~10 GB+ of memory. 3B and below gets generic. |
| **OpenAI-compatible** | LM Studio (`/lmstudio/v1`), OpenAI, Groq, OpenRouter… | Depends on the model. |
| **Claude** | Paste an Anthropic API key | Best quality. Optionally **researches the live web** before planning, so sources are real and current. |
| **Offline** | Nothing | Curated library and templates. Free, but generic for custom topics. |

How the app keeps a small model on track:
- Every call uses a strict JSON schema, which Ollama enforces as a grammar.
- Each day is planned in its own small call.
- Broken JSON is repaired or retried.
- Any day that still fails falls back to a template, so you always get a usable week.

A local model only knows its training data and can't browse. If the plans feel thin, try a 14B Qwen first, then Claude.

Your API keys stay in your browser's storage and are never included in exports.

## Project layout

```
src/
  lib/
    types.ts         domain model
    catalog.ts       70 curated topics, 17 domains
    planner.ts       learning arc, budget fitting, offline planner, rebalance, revisits
    recommend.ts     the interest / serendipity algorithm
    create.ts        topic → research → arc → daily tasks (AI with offline fallback)
    ai/providers.ts  Ollama, OpenAI-compatible, Claude; JSON repair; detect + test
    ai/generate.ts   prompts + schemas: brief, day plan, quiz, feedback, answers, recap, suggestions
    store.ts         zustand store (persisted to localStorage) + learning signals
  pages/             Today, NewHole, Hole (week/brief/questions/practice/journal/wrap-up),
                     Discover, History, You, Settings, Onboarding, Mobile (/m)
  components/        Shell, TaskItem (+ focus timer), widgets (depth meter, week strip, topic card)
  bits/              React Bits components (see credits)
```

Run the tests:

```bash
npm test
```

## Design

Built from the brand sheet. Ink `#161316`, brown `#453027`, orange `#FF6D29`, grey `#BABABA`, white `#FFFFFF`. Glass pill buttons and a warm grainy gradient with an orange glow. Big headlines use a white-to-orange gradient.

**Neue Montreal** is a commercial font, so it isn't bundled. The app uses it if it's installed on your device and falls back to Inter Tight otherwise.

## Notes & next steps

- **Data is stored per browser.** Your phone and laptop don't sync yet. Use **Settings → Export / Import** to move data between them. Syncing is the main job of the "deploy to phone" step.
- To try the phone view on your network now:
  1. Run `npm run dev`. The dev server already listens on your network.
  2. On your phone, open `http://<laptop-ip>:5173/m`.
  3. Use the browser's *Add to Home Screen*.

## Credits

UI effects come from **[React Bits](https://github.com/DavidHDev/react-bits)** by David Haz: Grainient, SpringCheck, SwipeRow, HoldButton, ThoughtLine, LatticeLoader, ShinyText, CountUp, SpotlightCard, ClickSpark. They're licensed MIT + Commons Clause (see `src/bits/LICENSE-react-bits.md`): fine to use in your apps, but the components themselves can't be resold.
