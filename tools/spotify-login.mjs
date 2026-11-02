// One-time Spotify login so the site build can read your playlist as you.
// Run it yourself in a terminal:  node tools/spotify-login.mjs
// It asks for the app's Client ID and secret, opens a Spotify login page,
// and saves the resulting token straight into the repo's GitHub secrets.
// Read-only: it asks Spotify for permission to read playlists, nothing else.
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import crypto from 'node:crypto';

const REPO = 'tucktuckg00se/tuckyes';
const REDIRECT = 'http://127.0.0.1:8888/callback';
const SCOPE = 'playlist-read-private playlist-read-collaborative';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const cid = (await rl.question('Spotify Client ID: ')).trim();
const secret = (await rl.question('Spotify Client secret: ')).trim();
rl.close();
if (!cid || !secret) { console.error('Need both.'); process.exit(1); }

const state = crypto.randomBytes(12).toString('hex');
const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: cid, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPE, state });

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, REDIRECT);
    if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
    const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(ok ? 'Done. You can close this tab.' : 'Login failed: ' + (u.searchParams.get('error') || 'bad state'));
    server.close();
    ok ? resolve(u.searchParams.get('code')) : reject(new Error(u.searchParams.get('error') || 'state mismatch'));
  }).listen(8888, '127.0.0.1', () => {
    console.log('\nOpening Spotify. If no browser opens, visit:\n' + url + '\n');
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  });
});

const res = await fetch('https://accounts.spotify.com/api/token', {
  method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(`${cid}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
});
const tok = await res.json();
if (!res.ok || !tok.refresh_token) { console.error('Spotify said:', tok); process.exit(1); }

// Quick check that the playlist is readable now.
const me = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json()).catch(() => ({}));
console.log(`Logged in as ${me.id || 'unknown'}.`);

const set = spawnSync('gh', ['secret', 'set', 'SPOTIFY_REFRESH_TOKEN', '-R', REPO], { input: tok.refresh_token, stdio: ['pipe', 'inherit', 'inherit'] });
if (set.status !== 0) { console.error('Could not save the GitHub secret (is gh logged in?).'); process.exit(1); }
console.log('Saved SPOTIFY_REFRESH_TOKEN to the repo secrets. The next deploy will use it.');
