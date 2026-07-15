// Local-only trigger server for the active-menu price-sync orchestrator
// (scripts/reconcile_active_menu_prices.ts). Deliberately NOT deployed — it
// only ever runs on a laptop you're sitting at (`npm run price-sync:server`
// alongside `npm run dev`), so the Catalog page's "Sync Active-Menu Prices"
// button (shown only in local dev) has something to call. Login still
// happens the existing way (`npm run scrape:login`, a real terminal, a
// visible browser window) — this server only runs the already-authenticated
// check/update pass, since that's the part with nothing left to click through.
import { createServer } from 'http';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PORT = 5175;
const AUTH_DIR = path.resolve('.auth');
const AUTH_FILES = ['booker.json', 'fresho.json', 'urban.json'];

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function authReady() {
  return AUTH_FILES.every(f => fs.existsSync(path.join(AUTH_DIR, f)));
}

function runOrchestrator(write) {
  return new Promise((resolve) => {
    const args = ['tsx', 'scripts/reconcile_active_menu_prices.ts'];
    if (write) args.push('--write');
    const child = spawn('npx', args, { cwd: process.cwd() });

    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('close', code => resolve({ exitCode: code, output }));
  });
}

const server = createServer(async (req, res) => {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authReady: authReady() }));
    return;
  }

  if (req.method === 'POST' && req.url?.startsWith('/run')) {
    if (!authReady()) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No saved wholesaler sessions. Run "npm run scrape:login" in a terminal first.' }));
      return;
    }
    const write = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('write') === 'true';
    const result = await runOrchestrator(write);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[price-sync-server] Listening on http://localhost:${PORT} (local-only, not deployed)`);
});
