#!/usr/bin/env node
// One-command local setup:  npm run setup
// Works the same on Windows, macOS and Linux. Safe to run again any time.

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[38;5;208m●\x1b[0m ${m}`);

console.log('\n\x1b[1mRabbit Hole — local setup\x1b[0m');

step('Checking Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.log(`  \x1b[31m✗\x1b[0m Node ${process.versions.node} is too old. Install Node 20 or newer from https://nodejs.org and run this again.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

step('Installing packages');
if (existsSync('node_modules')) ok('Already installed (run `npm install` yourself after pulling changes)');
else {
  execSync('npm install', { stdio: 'inherit' });
  ok('Installed');
}

step('Environment file');
if (existsSync('.env.local')) ok('.env.local already exists — left as is');
else {
  copyFileSync('.env.example', '.env.local');
  ok('Created .env.local from .env.example');
}
warn('Accounts are saved locally in .data/local-db.json. To use your real Vercel database instead, see .env.local.');

step('Optional: Ollama for local AI');
try {
  execSync('ollama --version', { stdio: 'ignore' });
  ok('Ollama found — pick it in Settings → AI engine, then "Detect local models"');
} catch {
  warn('Ollama not found. That’s fine: the default "Claude.ai copy & paste" engine needs nothing installed.');
}

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

console.log(`
\x1b[1mAll set.\x1b[0m Start the app with:

  npm run dev

Then open  http://localhost:5173
${lan.length ? `On your phone (same Wi-Fi):  ${lan.map((a) => `http://${a}:5173`).join('  or  ')}\n` : ''}
Other commands:
  npm run check     typecheck + tests + production build
  npm run preview   run the production build locally (port 4173)
`);
