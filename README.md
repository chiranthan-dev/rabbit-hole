# Rabbit Hole

**One topic. One week. Real understanding.**

Rabbit Hole is a weekly learning challenge. You pick something you're curious about and say how much time you have each day. Rabbit Hole researches the topic and builds a 7‑day plan of small, achievable tasks. The plan is designed so you *understand* the topic, not just tick boxes. It also learns what you're into and keeps suggesting rabbit holes you'd never have thought of yourself.

## Quick start

**Just want to use it?** Deploy it to Vercel (below) and open the link on your laptop and phone. The default AI engine is **Claude.ai copy & paste**, which needs nothing installed.

To run it locally you need **Node 20+**. Ollama with Qwen is optional (see *AI engines*).

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
- 119 hand-picked topics across 20 domains, each tagged with cross-cutting themes (systems, perception, networks…). The domains include **Self-growth** (habits, self-compassion, negotiation, decisions, meaning…), **Fictional worlds** (Tolkien's languages, the Cosmere, Earthsea, Dune, Discworld, Malazan, myths, fairy tales…) and **Training & endurance** (Ironman training, zone 2 / 80-20, race fuelling, swimming, recovery, VO₂ max…).
- Every suggestion is one of three kinds, and the card says why it was picked:
  - **Down your alley:** high affinity with the domains and themes you like.
  - **One hop over:** a *bridge* into a domain you barely know, through a theme that often appears alongside one you love.
  - **Wildcard:** deliberately far from your profile, favouring domains you've never explored, with seeded randomness.
- The **adventurousness** slider sets the mix. Signals that train it: onboarding picks, ♥, save, ✕ dismiss (30‑day cooldown), starting a hole, your final rating and "go deeper". Topics you've seen a lot fade so new ones come up.
- **AI suggestions** read your interest profile and invent topics outside the library. **Threads** turn your parked questions and "side tunnels" into new holes.
- The **You** page shows your interest map, the themes you gravitate to, domains you've never visited, and stats (streak, minutes, ideas you can explain).

**Phone view:** `/m` is the minimal checklist. Swipe a task left to finish it, tap it for details. It's an installable PWA, and the manifest opens straight to `/m`.

## Deploy to Vercel

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import **chiranthan-dev/rabbit-hole**. If it isn't listed, choose *Adjust GitHub App Permissions* and give Vercel access to the repo.
3. Leave everything as detected. `vercel.json` already sets Vite, `npm run build` and `dist`. Click **Deploy**.
4. You get a link like `https://rabbit-hole-xxxx.vercel.app`. Open it on your laptop, and on your phone use **Add to Home Screen** (Safari: Share button; Chrome: ⋮ menu).
5. **Add the database for sync:**
   1. In the Vercel project, go to **Storage → Create Database → Upstash (Redis)**. The free plan is enough.
   2. Click **Connect** to this project. This adds the `KV_REST_API_*` / `UPSTASH_REDIS_REST_*` environment variables.
   3. Go to **Deployments → ⋯ → Redeploy** so the variables take effect.
   
   You can connect the same Upstash database to your other Vercel apps. Rabbit Hole only uses keys that start with `rh:`.

Every push to the production branch redeploys automatically.

## Sync across devices

1. On your laptop: **Settings → Sync across devices → Turn on sync**.
2. On your phone: scan the QR code with the camera, or open the copied link. It links straight away, with no account needed.

After that, changes sync within a couple of seconds, plus whenever you switch back to the app. If both devices changed things, the changes are merged: the newest version of each hole and of your profile wins, and deletions are remembered.

The sync code is the only key to your data. Keep it private; you can turn sync off per device at any time. API keys never sync.

How it works:
- `api/sync.ts` is a Vercel Function. It stores one versioned JSON snapshot per hashed code in Upstash and rejects stale writes.
- `src/lib/sync.ts` tracks changes on each device and merges them.
- `npm run dev` runs the same API locally with an in-memory store. Put the Upstash variables in `.env.local` to use the real database instead.

## The Claude copy & paste flow (default)

1. When you start a rabbit hole, the app writes a prompt with your topic, angle, depth and the minutes for each day.
2. **Copy prompt & open Claude** copies it and opens claude.ai. Turn on web search in Claude, then send it.
3. Claude researches and replies with your whole week as JSON (a file or a code block).
4. Paste the reply or upload the file. The app checks it, trims any day that's over your time, keeps the real links Claude found, and saves Claude's quiz questions for Practice.

Answers to parked questions, feedback on your explanations, the week recap and new topic ideas work the same way. Your wizard choices are saved, so switching to the Claude app on your phone and back is fine.

## AI engines

All AI calls go through one interface (`src/lib/ai/providers.ts`). Changing engines is a setting, not a code change.

| Engine | Setup | Quality |
|---|---|---|
| **Claude.ai copy & paste** (default) | Nothing; uses your Claude account | Best quality with real web sources. One copy-paste per week. |
| **Ollama** | Only when running locally: `ollama pull qwen2.5:7b`, URL `/ollama` | 7B/8B works; **Qwen 2.5 14B / Qwen 3 14B** are noticeably better if you have ~10 GB+ of memory. 3B and below gets generic. |
| **OpenAI-compatible** | LM Studio (`/lmstudio/v1`), OpenAI, Groq, OpenRouter… | Depends on the model. |
| **Claude API** | Paste an Anthropic API key (billed per use) | Best quality. Optionally **researches the live web** before planning, so sources are real and current. |
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
api/
  sync.ts            Vercel Function for sync (Upstash Redis)
src/
  lib/
    types.ts         domain model
    catalog.ts       119 curated topics, 20 domains
    planner.ts       learning arc, budget fitting, offline planner, rebalance, revisits
    recommend.ts     the interest / serendipity algorithm
    create.ts        topic → research → arc → daily tasks (AI with offline fallback)
    manual.ts        Claude copy & paste: prompts + importer for the JSON Claude sends back
    ai/providers.ts  Ollama, OpenAI-compatible, Claude; JSON repair; detect + test
    ai/generate.ts   prompts + schemas: brief, day plan, quiz, feedback, answers, recap, suggestions
    store.ts         zustand store (persisted to localStorage) + learning signals
    sync.ts          cross-device sync: change tracking, merge, push/pull
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

- The hosted version can't reach Ollama on your laptop. Use the copy & paste flow there.

## Credits

UI effects come from **[React Bits](https://github.com/DavidHDev/react-bits)** by David Haz: Grainient, SpringCheck, SwipeRow, HoldButton, ThoughtLine, LatticeLoader, ShinyText, CountUp, SpotlightCard, ClickSpark. They're licensed MIT + Commons Clause (see `src/bits/LICENSE-react-bits.md`): fine to use in your apps, but the components themselves can't be resold.
