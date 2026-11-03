<div align="center">

<img src="public/favicon.svg" width="72" alt="Rabbit Hole logo" />

# Rabbit Hole

### One topic. One week. Real understanding.

A weekly learning challenge: pick something you're curious about, say how much time you have each day,<br/>
and get a researched 7‑day plan built for *understanding*, not box‑ticking.

[![React](https://img.shields.io/badge/React_19-161316?style=flat-square&logo=react&logoColor=FF6D29)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-161316?style=flat-square&logo=typescript&logoColor=FF6D29)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-161316?style=flat-square&logo=vite&logoColor=FF6D29)](https://vite.dev)
[![PWA](https://img.shields.io/badge/Installable_PWA-161316?style=flat-square&logo=pwa&logoColor=FF6D29)](#-on-your-phone)
[![Vercel](https://img.shields.io/badge/Vercel_+_Upstash-161316?style=flat-square&logo=vercel&logoColor=FF6D29)](#-deploy-to-vercel)
[![Tests](https://img.shields.io/badge/tests-41_passing-161316?style=flat-square&logo=vitest&logoColor=FF6D29)](#-development)

**[▶ Open the live app](https://rabbit-hole-sooty-ten.vercel.app)** &nbsp;·&nbsp; [📱 Phone checklist](https://rabbit-hole-sooty-ten.vercel.app/m)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fchiranthan-dev%2Frabbit-hole)

<img src="docs/hero.jpg" alt="Rabbit Hole on desktop and phone" width="100%" />

</div>

---

## Contents

- [See it in action](#-see-it-in-action)
- [Why Rabbit Hole](#-why-rabbit-hole)
- [Features](#-features)
- [How it works](#-how-it-works)
- [On your phone](#-on-your-phone)
- [Quick start](#-quick-start)
- [Deploy to Vercel](#-deploy-to-vercel)
- [AI engines](#-ai-engines)
- [Development](#-development)
- [Roadmap](#-roadmap)
- [Credits](#-credits)

## 🎬 See it in action

<div align="center">
<img src="docs/demo.gif" alt="Picking a topic, handing the research to Claude, pasting the plan back and ticking off the first task" width="100%" />
<br/>
<sub>Already in 2 holes → start a 3rd: set your time per day → Claude researches it → paste the plan back → start → tick a task, say how well it clicked → flip between your holes.</sub>
</div>

## 💡 Why Rabbit Hole

Most learning apps reward finishing. Rabbit Hole rewards **getting it**.

- **A week is the right size.** Long enough to go deep, short enough to finish. Then you pick the next hole.
- **Your account, any device.** Sign up once; your holes follow you between laptop and phone.
- **Up to 3 at once.** Run an Ironman week next to a fantasy world and a habit, and flip between them in one tap.
- **Your time, respected.** You set the minutes for each day, and the plan always fits. Rest days are allowed.
- **Understanding first.** Every task says *why* it matters and ends with a checkpoint question. Things you mark as fuzzy come back the next day.
- **Curiosity compounds.** The questions you park become future rabbit holes, and the recommender keeps nudging you somewhere you'd never have searched for.

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

**📅 Today**<br/>
Your day's checklist with a focus timer on every task. The **switcher** at the top flips between up to 3 holes, showing each one's progress and minutes left. After ticking a task, rate it *Fuzzy / Getting it / Clicked* and answer its checkpoint.

</td>
<td width="50%" valign="top">

**🧭 Discover**<br/>
119 hand-picked topics across 20 areas: self-growth, fictional worlds, endurance training, science, history, music and more. Each pick is labelled *Down your alley*, *One hop over* or *Wildcard*, with the reason it was chosen.

</td>
</tr>
<tr>
<td><img src="docs/screenshots/today.jpg" alt="Today view" /></td>
<td><img src="docs/screenshots/discover.jpg" alt="Discover view" /></td>
</tr>
<tr>
<td width="50%" valign="top">

**🤖 Let Claude do the research**<br/>
Rabbit Hole writes a prompt with your topic, your angle and your exact minutes for each day. Claude searches the web and sends back the whole week, and you paste it in. You get real sources, with no API keys or costs.

</td>
<td width="50%" valign="top">

**🗺️ The brief**<br/>
The big picture, the key ideas to master (new → fuzzy → clear), guiding questions, common misconceptions, and resources with real links.

</td>
</tr>
<tr>
<td><img src="docs/screenshots/claude.jpg" alt="Claude hand-off step" /></td>
<td><img src="docs/screenshots/brief.jpg" alt="Brief tab" /></td>
</tr>
<tr>
<td width="50%" valign="top">

**🧠 Practice**<br/>
Quizzes that test understanding rather than trivia, plus a Feynman box: "explain it like I'm 12", with feedback on what you got right and the gaps you missed.

</td>
<td width="50%" valign="top">

**📈 You**<br/>
Stats (streak, time spent, ideas you can explain), your interest map, the themes you gravitate to, and the areas you've never explored.

</td>
</tr>
<tr>
<td><img src="docs/screenshots/quiz.jpg" alt="Quiz" /></td>
<td><img src="docs/screenshots/you.jpg" alt="You page" /></td>
</tr>
<tr>
<td width="50%" valign="top">

**🗓️ The whole week**<br/>
A 7-day arc: *Lay of the land → Foundations → How it works → Hands on → Stories & arguments → Your own tunnel → Teach it back*. Fell behind? **Rebalance** moves unfinished work to days with room, and **Change my time** resizes the rest of the week.

</td>
<td width="50%" valign="top">

**📓 Journal & first-run**<br/>
Every past hole with your wrap-up, rating and the questions it left behind, exportable as Markdown. Onboarding takes about 30 seconds.

</td>
</tr>
<tr>
<td><img src="docs/screenshots/week.jpg" alt="Week tab" /></td>
<td><img src="docs/screenshots/journal.jpg" alt="Journal" /></td>
</tr>
</table>

### 🕳️🕳️🕳️ Up to three holes at once

<table>
<tr>
<td width="50%" valign="top">

Be in **up to 3 rabbit holes at the same time**, each with its own week, time budget and progress. The switcher shows how far along each one is today and the total minutes left across all of them.

When you plan a new hole, every day shows the minutes your other holes already need (*"+40m other"*), so the combined week stays realistic. Hit the limit and Rabbit Hole asks you to finish or **shelve** one; shelved holes keep all their notes and can be resumed later.

</td>
<td width="50%" valign="top"><img src="docs/screenshots/limit.jpg" alt="Limit of three active rabbit holes with shelve options" /></td>
</tr>
</table>

### 🔐 Accounts

<table>
<tr>
<td width="50%" valign="top"><img src="docs/screenshots/welcome.jpg" alt="Welcome screen with Create account and Log in" /></td>
<td width="50%" valign="top"><img src="docs/screenshots/recovery.jpg" alt="Save your recovery code" /></td>
</tr>
<tr>
<td colspan="2">

Share the link, and anyone can **create an account** (name, email, password) or **log in**. Your holes, notes and interests save to your account and show up on every device you log in on. If you forget your password, the **recovery code** you saved at sign-up resets it. Settings has **change password**, **log out everywhere** and **delete account**. Want to try it first? **Continue without an account** keeps everything in the browser, and it's carried over if you sign up later.

</td>
</tr>
</table>

<details>
<summary><b>Everything else in v1</b></summary>

- **Up to 3 rabbit holes at once:** each has its own plan, time budget and progress. While you plan a new one, the wizard shows how many minutes your other holes already take each day, so you don't overload yourself. At 3, you're asked to finish or shelve one first; shelved holes can be resumed from the Journal.
- **Past holes from the main screen:** the **Past** button next to the switcher (laptop and phone) lists shelved and finished holes. **Resume** a shelved one (its unfinished days are moved to start today) or open any of them to see your notes and recap. With no active hole, they're listed right on the main screen.
- **Curiosity log:** park questions instead of getting derailed. Ask Claude about them, and turn any of them into next week's hole.
- **Spaced revisits:** marking a task *Fuzzy* adds a 10‑minute revisit to the next day.
- **Wrap-up:** reflect on the week, rate it, hold to close the hole, and get a recap from Claude. Your rating trains the recommender.
- **Replan a day** with AI, **add your own tasks**, **skip** tasks, and keep **end-of-day notes**.
- **Real links only:** Claude's URLs are checked and kept, with search links as a backup. The app never shows model-invented URLs.
- **Backup:** export and import a JSON file. API keys are never included.
- **Look & feel:** animated grain background (or a static one) and a reduced-motion mode.

</details>

## 🔍 How it works

```mermaid
flowchart LR
    A[Pick a topic<br/>+ your angle] --> B[Minutes<br/>for each day]
    B --> C{AI engine}
    C -->|default| D[Copy prompt → Claude.ai<br/>researches the web]
    D --> E[Paste / upload<br/>Claude's JSON]
    C -->|optional| F[Ollama · Claude API ·<br/>OpenAI-compatible]
    C -->|no AI| G[Offline library<br/>+ templates]
    E & F & G --> H[Validate + fit<br/>to your time]
    H --> I[7-day plan<br/>brief · tasks · quiz]
    I --> J[Do · rate · park questions]
    J --> K[Wrap up + rating]
    K --> L[Interest profile]
    L --> M[Next suggestions]
    M --> A
```

**The recommender** (`src/lib/recommend.ts`) mixes three kinds of picks:

| Kind | How it's chosen |
|---|---|
| **Down your alley** | Highest affinity with the areas and themes you like |
| **One hop over** | A bridge into an area you barely know, through a theme that often appears alongside one you love |
| **Wildcard** | Deliberately far from your profile, favouring areas you've never explored, with seeded randomness |

The **adventurousness** slider sets the mix. It learns from onboarding picks, ♥, saves, ✕ (30‑day cooldown), the holes you start, your final ratings and "go deeper". Topics you've seen a lot fade so new ones come up.

## 📱 On your phone

<div align="center">
<img src="docs/phones.jpg" alt="Phone screens: today, checklist, task details, brief" width="100%" />
</div>

<table>
<tr>
<td width="320" valign="top"><img src="docs/phone.gif" alt="Swiping tasks to finish them on the phone checklist" width="300" /></td>
<td valign="top">

**`/m` is the minimal checklist.** It shows just today's tasks: swipe a task left to finish it, tap for its details. Switch holes from the pills at the top, or **swipe the title left/right**.

- **Install it:** open your Vercel link and choose **Add to Home Screen**. It opens straight to the checklist.
- **Same account everywhere:** log in on your phone with the same email and password. Everything saves to your account within seconds, and edits from both devices merge automatically.

<img src="docs/screenshots/account.jpg" alt="Account settings" width="100%" />

</td>
</tr>
</table>

## 🚀 Quick start

You need **Node 20+**.

```bash
git clone https://github.com/chiranthan-dev/rabbit-hole.git
```

```bash
cd rabbit-hole
```

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173>. The default engine is **Claude.ai copy & paste**, so nothing else is needed. Accounts work locally too, using an in-memory store that resets when you restart the server. To use your real database instead, put the Upstash variables in `.env.local`.

To use a local model instead, run Ollama, then in **Settings** click **Detect local models** and **Test connection**:

```bash
ollama pull qwen2.5:7b
```

## ☁️ Deploy to Vercel

1. Click **Deploy with Vercel** above, or go to <https://vercel.com/new> and import this repo. `vercel.json` already sets the build. Click **Deploy**.
2. **Add the database** (accounts need it):
   1. In the project, go to **Storage → Create Database → Upstash (Redis)**. The free plan is enough.
   2. Click **Connect** to this project.
   3. Go to **Deployments → ⋯ → Redeploy**.
3. Open the link, create your account, then log in on your phone and choose **Add to Home Screen**.
4. **Share the link.** Anyone can sign up for their own private account. Without the database, the app still works in guest mode (saved only in the browser).

One Upstash database can serve several Vercel apps; Rabbit Hole only uses keys that start with `rh:`. Every push to the production branch redeploys automatically.

<details>
<summary><b>How accounts and saving work</b></summary>

- `api/account.ts` is a single, self-contained Vercel Function that handles sign-up, login, logout, logout everywhere, password change, recovery-code reset, account deletion and per-user data.
- **Passwords and recovery codes** are hashed with **scrypt** (random salt), and checked in constant time. Login answers with the same message for an unknown email and a wrong password.
- **Sessions** are random 256-bit tokens in an `HttpOnly; Secure; SameSite=Lax` cookie, valid for 30 days. Only a SHA-256 of each token is stored. Changing your password or choosing *Log out everywhere* signs out every other device.
- **Rate limits:** sign-ups (10 per hour per IP), logins (30 per 15 min per IP and 10 per 15 min per account) and resets.
- **Forgot your password?** Since there's no email service, every account gets a one-time **recovery code** at sign-up. Using it resets the password and issues a new code.
- **Your data** is one versioned JSON document per user, capped at about 900 KB. Stale writes are rejected (HTTP 409). `src/lib/sync.ts` timestamps each section on every device, then merges section by section: the newest version wins, and deletions are remembered.
- **Logging out** removes your data from that browser; it stays safe in your account. Guest data is merged into your account when you sign up or log in.

</details>

</details>

## 🤖 AI engines

All AI goes through one interface (`src/lib/ai/providers.ts`). Changing engines is a setting, not a code change.

| Engine | Setup | Notes |
|---|---|---|
| **Claude.ai copy & paste** *(default)* | Nothing; uses your Claude account | Best quality with real web sources. One copy-paste per week. |
| **Ollama** | Local only: `ollama pull qwen2.5:7b` | 7B/8B works; Qwen 14B is noticeably better. Can't browse the web. |
| **OpenAI-compatible** | LM Studio, OpenAI, Groq, OpenRouter… | Depends on the model. |
| **Claude API** | Anthropic API key (billed per use) | Automatic, optional live web research. |
| **Offline** | Nothing | Curated library and templates. |

Plans always fit your time. Every reply is checked against a strict JSON schema, broken JSON is repaired or retried, days over budget are trimmed, and any day that still fails falls back to a template.

## 🛠️ Development

| | |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, React Router, Zustand (persisted) |
| **UI** | Custom design system plus [React Bits](https://github.com/DavidHDev/react-bits) components, Hugeicons, Inter Tight |
| **PWA** | `vite-plugin-pwa`; installs and opens to `/m` |
| **Backend** | One Vercel Function (accounts + data) and Upstash Redis |
| **Tests** | Vitest (planner, recommender, Claude importer, accounts API, sync merge, multiple holes), plus Playwright walkthroughs |

```bash
npm test
```

```bash
npm run build
```

<details>
<summary><b>Project layout</b></summary>

```
api/
  account.ts         Vercel Function: accounts, sessions, per-user data (Upstash Redis)
src/
  lib/
    catalog.ts       119 curated topics, 20 areas
    planner.ts       learning arc, time fitting, offline planner, rebalance, revisits
    recommend.ts     the interest / serendipity algorithm
    manual.ts        Claude copy & paste: prompts + importer
    create.ts        topic → research → arc → daily tasks (AI with offline fallback)
    ai/              providers (Ollama, OpenAI-compatible, Claude) + prompts & schemas
    store.ts         app state + learning signals
    auth.ts          sign up / log in / log out / reset on the client
    sync.ts          saves to your account: change tracking + merge
  pages/             Today, NewHole, Hole, Discover, History, You, Settings, Onboarding, Mobile, LinkDevice
  components/        Shell, TaskItem, HoleSwitcher, PastHoles, AccountPanel, ClaudeHandoff, widgets
  bits/              React Bits components
docs/                README images and GIFs
```

</details>

## 🎨 Design

Built from a brand sheet: ink `#161316`, brown `#453027`, orange `#FF6D29`, grey `#BABABA`, white `#FFFFFF`. Glass pill buttons, a warm grainy gradient with an orange glow, and white-to-orange headlines. **Neue Montreal** is used if it's installed on your device; otherwise the app falls back to Inter Tight.

## 🗺️ Roadmap

- [x] Weekly plans that fit your time, built for understanding
- [x] Claude copy & paste research flow
- [x] Interest-learning recommender with bridges and wildcards
- [x] Phone checklist (PWA)
- [x] Accounts: sign up, log in on any device, recovery codes
- [x] Up to 3 rabbit holes at once, with a switcher on laptop and phone
- [ ] Password reset by email and "Sign in with Google" (needs an email/OAuth provider)
- [ ] Reminders and notifications
- [ ] Share a finished hole as a public page
- [ ] Streak-friendly home-screen widget

## 🙏 Credits

UI effects come from **[React Bits](https://github.com/DavidHDev/react-bits)** by David Haz: Grainient, SpringCheck, SwipeRow, HoldButton, ThoughtLine, LatticeLoader, ShinyText, CountUp, SpotlightCard and ClickSpark. They're licensed MIT + Commons Clause (see `src/bits/LICENSE-react-bits.md`): fine to use in apps, but the components themselves can't be resold.

<div align="center"><sub>Made by <a href="https://github.com/chiranthan-dev">chiranthan-dev</a></sub></div>
