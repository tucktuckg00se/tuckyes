// Builds tuckyes.com from the markdown files in content/ into dist/.
//
//   npm run build              normal build (pulls Letterboxd + GitHub stats)
//   npm run build -- --offline skip the network, build from content only
//
// Nothing in here needs editing for day-to-day use. Write posts in
// content/posts, recipes in content/cookbook, and push.

import { readFile, writeFile, readdir, mkdir, cp, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'dist');
const OFFLINE = process.argv.includes('--offline');
const NOW = new Date();

marked.setOptions({ gfm: true });

// ---------- small helpers ----------

const exists = p => access(p).then(() => true, () => false);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unquote = s => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const list = v => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
const warn = msg => console.warn('  ! ' + msg);
const slugify = s => s.toLowerCase().replace(/\.md$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
const isHidden = d => /^(true|yes|1)$/i.test(String(d.hidden || ''));
const splitPipe = s => String(s).split('|').map(x => x.trim());

// Front matter: the simple YAML that Obsidian's properties write.
function parse(src) {
  const data = {};
  let body = src;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (m) {
    body = src.slice(m[0].length);
    let key = null;
    for (const raw of m[1].split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const item = /^\s*-\s*(.*)$/.exec(raw);
      if (item && key) {
        if (!Array.isArray(data[key])) data[key] = data[key] ? [data[key]] : [];
        if (item[1].trim()) data[key].push(unquote(item[1]));
        continue;
      }
      const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
      if (kv) { key = kv[1]; data[key] = kv[2].trim() === '' ? '' : unquote(kv[2]); }
    }
  }
  return { data, body: body.trim() };
}

// "antenna.jpg" means content/media/antenna.jpg; "assets/..." stays as is.
function src(p, rel) {
  if (!p) return '';
  if (/^https?:\/\//.test(p)) return p;
  p = p.replace(/^\/+/, '');
  if (!p.includes('/')) p = 'media/' + p;
  return rel + p.split('/').map(encodeURIComponent).join('/');
}

// ---------- images ----------
// Photos in content/media are never changed. The build writes web-sized
// copies to dist/media (at most FULL px on the long edge) and small square
// thumbnails to dist/media/_thumbs/<size>/ for tiles, so a 3 MB photo used as
// a 60px friend tile costs a few KB. Without sharp it just copies the files.
const FULL = 1600;
const RASTER = /\.(jpe?g|png|webp|avif|tiff?)$/i;
const thumbJobs = new Map();
function thumb(p, size, rel) {
  if (!p || /^https?:\/\//.test(p) || p.replace(/^\/+/, '').includes('/') || !RASTER.test(p)) return src(p, rel);
  const out = `_thumbs/${size}/${p.replace(/\.[^.]+$/, '')}.webp`;
  thumbJobs.set(out, { file: p, size });
  return src(`media/${out}`, rel);
}
async function buildMedia() {
  const from = path.join(CONTENT, 'media'), to = path.join(OUT, 'media');
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { warn('sharp is not installed; copying images at full size'); }
  await mkdir(to, { recursive: true });
  const names = (await exists(from)) ? (await readdir(from, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name) : [];
  await Promise.all(names.map(async name => {
    const a = path.join(from, name), b = path.join(to, name);
    if (!sharp || !RASTER.test(name)) return cp(a, b);
    try {
      const img = sharp(a, { failOn: 'none' }).rotate();
      const { width = 0, height = 0 } = await sharp(a).metadata();
      const bytes = (await readFile(a)).length;
      if (Math.max(width, height) <= FULL && bytes <= 400_000) return cp(a, b);
      const resized = img.resize({ width: FULL, height: FULL, fit: 'inside', withoutEnlargement: true });
      const ext = name.split('.').pop().toLowerCase();
      const outBuf = await (ext === 'png' ? resized.png({ compressionLevel: 9, palette: true, quality: 90 })
        : ext === 'webp' ? resized.webp({ quality: 82 })
        : ext === 'avif' ? resized.avif({ quality: 60 })
        : resized.jpeg({ quality: 82, mozjpeg: true })).toBuffer();
      await writeFile(b, outBuf.length < bytes ? outBuf : await readFile(a));
    } catch (e) { warn(`${name}: could not resize (${e.message}); copied as is`); await cp(a, b); }
  }));
  await Promise.all([...thumbJobs].map(async ([out, { file, size }]) => {
    const a = path.join(from, file), b = path.join(to, out);
    if (!(await exists(a))) return;
    await mkdir(path.dirname(b), { recursive: true });
    if (!sharp) return cp(a, b);
    try { await sharp(a, { failOn: 'none' }).rotate().resize(size, size, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toFile(b); }
    catch (e) { warn(`${file}: no thumbnail (${e.message})`); await cp(a, b); }
  }));
}

// Markdown with Obsidian extras: ![[image.png]] embeds and [[links]].
function md(text, rel, { inline = false } = {}) {
  const t = String(text || '')
    .replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_, file, alt) => `![${(alt && !/^\d+$/.test(alt)) ? alt : ''}](${src(file.trim(), rel)})`)
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_, page, label) => label || page);
  return inline ? marked.parseInline(t) : marked.parse(t);
}

const plain = text => String(text || '')
  .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a)
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();

const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const isoDate = d => d.toISOString().slice(0, 10);

function photo(file, alt, rel, size = 0) {
  const full = src(file, rel), shown = size ? thumb(file, size, rel) : full;
  return `<figure><button type="button"><img src="${esc(shown)}"${shown !== full ? ` data-full="${esc(full)}"` : ''} alt="${esc(alt)}" loading="lazy" onerror="this.closest('figure').classList.add('gone')"></button></figure>`;
}
function photos(items, rel) {
  if (!items.length) return '';
  return `<div class="photos">${items.map(s => { const [f, a = ''] = splitPipe(s); return photo(f, a, rel); }).join('')}</div>`;
}

async function readDir(dir) {
  if (!(await exists(dir))) return [];
  const names = (await readdir(dir)).filter(n => n.endsWith('.md') && !n.startsWith('_') && !n.startsWith('.'));
  const items = await Promise.all(names.map(async name => ({ name, ...parse(await readFile(path.join(dir, name), 'utf8')) })));
  return items.filter(it => !isHidden(it.data));
}
const readText = p => readFile(path.join(CONTENT, p), 'utf8').catch(() => '');
const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.replace(/^[-*]\s+/, ''));

function dated(items) {
  return items.map(n => {
    const raw = n.data.date || (/^(\d{4}-\d{2}-\d{2})/.exec(n.name) || [])[1];
    const date = raw ? new Date(String(raw).slice(0, 10) + 'T00:00:00Z') : null;
    if (!date || isNaN(date)) warn(`${n.name} has no date; add "date: YYYY-MM-DD" at the top`);
    return { ...n, date: date && !isNaN(date) ? date : new Date(0), slug: slugify(n.name) };
  }).sort((a, b) => b.date - a.date || b.name.localeCompare(a.name));
}

// ---------- content ----------

async function loadSite() {
  const { data } = parse(await readFile(path.join(CONTENT, 'site.md'), 'utf8'));
  return {
    name: data.name || 'Tucker',
    fullName: data.full_name || data.name || 'Tucker',
    url: (data.url || 'https://tuckyes.com').replace(/\/$/, ''),
    email: data.email || '',
    portrait: data.portrait || '',
    github: data.github || '',
    letterboxd: data.letterboxd || '',
    headline: data.headline || '',
    location: data.location || '',
    mood: data.mood || '',
    playlist: data.playlist || '',
    song: data.song || '',
    songTitle: data.song_title || '',
    details: list(data.details).map(splitPipe).map(([label, value = '']) => ({ label, value })),
    effect: /^(none|off|false)$/i.test(data.background_effect || '') ? 'none' : /^(grain|stars)$/i.test(data.background_effect || '') ? data.background_effect.toLowerCase() : 'pixels',
    bgColor: data.background_color || '#030304',
    bgDots: data.background_dots || '',
    bgImage: data.background_image || '',
    postsOnProfile: parseInt(data.posts_on_profile, 10) || 8,
    filmsToShow: Number.isNaN(parseInt(data.films_to_show, 10)) ? 4 : parseInt(data.films_to_show, 10),
  };
}

// Recipes are one note each, like in Obsidian. A subfolder of content/cookbook
// is a category ("cookbook/Soups/Pho.md"). The file name is the title.
async function readRecipes(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      for (const it of await readDir(path.join(dir, entry.name))) out.push({ ...it, category: it.data.category || entry.name });
    } else if (entry.name.endsWith('.md')) {
      const it = parse(await readFile(path.join(dir, entry.name), 'utf8'));
      if (!isHidden(it.data)) out.push({ name: entry.name, ...it, category: it.data.category || '' });
    }
  }
  return out;
}

function loadRecipes(items) {
  const used = new Set();
  return items.map(r => {
    let body = r.body;
    let title = r.data.title;
    const h1 = /^#\s+(.+)\s*$/m.exec(body);
    if (!title && h1 && body.trimStart().startsWith('#')) title = h1[1].trim();
    if (h1 && title && h1[1].trim() === title) body = body.replace(h1[0], '').trim();
    title = title || r.name.replace(/\.md$/, '');
    let slug = slugify(r.name);
    if (used.has(slug)) slug = `${slug}-${slugify(r.category || 'more')}`;
    used.add(slug);
    return { ...r, title, body, slug };
  }).sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
}

// ---------- things pulled from elsewhere ----------

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'tuckyes-build', ...headers }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

async function githubStats(repo) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let releases = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await getJSON(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, headers);
    releases = releases.concat(batch);
    if (batch.length < 100) break;
  }
  const stable = releases.find(r => !r.draft && !r.prerelease);
  const downloads = releases.reduce((sum, r) => sum + (r.assets || []).reduce((s, a) => s + (a.download_count || 0), 0), 0);
  return stable ? { tag: stable.tag_name, date: new Date(stable.published_at), url: stable.html_url, downloads } : null;
}

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function letterboxdFilms(user, count) {
  const res = await fetch(`https://letterboxd.com/${user}/rss/`, { headers: { 'User-Agent': 'tuckyes-build' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} from Letterboxd`);
  const xml = await res.text();
  const tag = (s, t) => { const m = new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(s); return m ? decode(m[1]).trim() : ''; };
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(m => m[1])
    .map(s => ({ title: tag(s, 'letterboxd:filmTitle'), year: tag(s, 'letterboxd:filmYear'), rating: parseFloat(tag(s, 'letterboxd:memberRating')), link: tag(s, 'link') }))
    .filter(f => f.title)
    .slice(0, count);
}

// Newest songs on the playlist, read (never changed) through Spotify's API.
// Needs SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REFRESH_TOKEN
// (GitHub repo secrets). Spotify only lets new apps read a playlist as its
// owner, so the refresh token comes from logging in once: tools/spotify-login.mjs.
// Spotify adds songs to the end, so this reads the end and flips it.
async function spotifyNewest(url, count) {
  const id = (/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]+)/.exec(url || '') || [])[1];
  const { SPOTIFY_CLIENT_ID: cid, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !cid || !secret) return null;
  const tok = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${cid}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: refresh ? `grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh)}` : 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });
  if (!tok.ok) throw new Error(`${tok.status} getting a Spotify token`);
  const auth = { Authorization: `Bearer ${(await tok.json()).access_token}` };
  // Spotify renamed /tracks to /items for newer apps; try the new name first.
  let base = `https://api.spotify.com/v1/playlists/${id}/items`, first;
  try { first = await getJSON(`${base}?limit=1`, auth); }
  catch (e) {
    base = `https://api.spotify.com/v1/playlists/${id}/tracks`;
    try { first = await getJSON(`${base}?limit=1`, auth); }
    catch (e2) { throw new Error(`${e.message}; ${e2.message}${refresh ? '' : ' (no SPOTIFY_REFRESH_TOKEN; run tools/spotify-login.mjs)'}`); }
  }
  const offset = Math.max(0, (first.total || 0) - count);
  const page = await getJSON(`${base}?limit=${count}&offset=${offset}`, auth);
  return (page.items || [])
    .map(it => ({ added: it.added_at, t: it.item || it.track }))
    .filter(x => x.t && x.t.id && x.t.type !== 'episode')
    .map(x => ({ id: x.t.id, title: x.t.name, artists: (x.t.artists || []).map(a => a.name).join(', '), added: x.added }))
    .reverse();
}

// Spotify share links become embeds: open.spotify.com/playlist/ID -> /embed/playlist/ID
function spotifyEmbed(url) {
  const m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/.exec(url || '');
  return m ? { embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0`, link: `https://open.spotify.com/${m[1]}/${m[2]}` } : null;
}

const stars = r => (!r || isNaN(r)) ? '' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');

// ---------- rendering ----------

function renderStatus(latest) {
  if (!latest) return '';
  const days = (NOW - latest.date) / 86400000;
  return days <= 2
    ? `<p class="online"><span class="dot" aria-hidden="true"></span>Online now!</p>`
    : `<p class="login">Last login: ${fmtDate(latest.date)}</p>`;
}

function renderPost(n, rel) {
  const pics = list(n.data.images).concat(list(n.data.image));
  const mood = n.data.mood ? ` <span class="post-mood">mood: ${esc(n.data.mood)}</span>` : '';
  return `<article class="post" id="${esc(n.slug)}"><p class="post-when"><time datetime="${isoDate(n.date)}">${fmtDate(n.date)}</time>${mood}</p><div class="post-body">${md(n.body, rel)}${photos(pics, rel)}</div></article>`;
}

function renderMade(items, stats, rel) {
  return items.map((it, i) => {
    const d = it.data;
    const pics = list(d.images);
    const st = d.github && stats[d.github];
    const statLine = st ? `<p class="stats">Latest release <a href="${esc(st.url)}">${esc(st.tag)}</a>, ${fmtDate(st.date)}. Downloaded ${st.downloads.toLocaleString('en-US')} times so far.</p>` : '';
    const link = d.link ? ` <a href="${esc(d.link)}">${esc(d.link_text || 'Take a look.')}</a>` : '';
    let body = md(it.body, rel);
    if (link) body = /<\/p>\s*$/.test(body) ? body.replace(/<\/p>\s*$/, `${link}</p>`) : body + `<p>${link.trim()}</p>`;
    const title = d.title || it.name.replace(/\.md$/, '');
    let thumb;
    if (pics.length) {
      const [f, a = ''] = splitPipe(pics[0]);
      thumb = `<div class="photos thumb">${photo(f, a || title, rel, 180)}</div>`;
    } else {
      thumb = `<div class="tile t${i % 6}" aria-hidden="true">${esc(d.short || title)}</div>`;
    }
    const more = pics.length > 1 ? photos(pics.slice(1), rel) : '';
    return `<article class="made" id="made-${esc(slugify(it.name))}">${thumb}<div class="made-text"><h3>${esc(title)}</h3>${body}${statLine}${more}</div></article>`;
  }).join('\n');
}

function renderFriends(friends, rel, max = 8) {
  return `<ol class="top8">${friends.slice(0, max).map(([name, link = '', pic = ''], i) => {
    const img = pic ? `<img src="${esc(thumb(pic, 160, rel))}" alt="" loading="lazy" onerror="this.remove()">` : '';
    const inner = `<span class="tile t${i % 6}">${img}<span class="tile-name">${esc(name.slice(0, 1).toUpperCase())}</span></span><span class="label">${esc(name)}</span>`;
    return `<li>${link ? `<a href="${esc(link)}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
  }).join('')}</ol>`;
}

function renderInterests(text, films, rel) {
  const rows = text.split(/\r?\n/).map(l => /^\s*[-*]\s+\*\*(.+?)\*\*\s*[:\-–—]?\s*(.*)$/.exec(l)).filter(Boolean).map(([, k, v]) => [k, md(v, rel, { inline: true })]);
  if (films.length) {
    const recent = `Recently watched:<ul class="watched">${films.map(f => `<li><a href="${esc(f.link)}">${esc(f.title)}</a>${f.year ? ` (${esc(f.year)})` : ''}${stars(f.rating) ? ` <span class="stars" aria-label="${f.rating} out of 5">${stars(f.rating)}</span>` : ''}</li>`).join('')}</ul>`;
    const row = rows.find(([k]) => /movie|film/i.test(k));
    if (row) row[1] += `<br>${recent}`; else rows.push(['Movies', recent]);
  }
  return rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join('');
}

const renderDetails = details => details.map(({ label, value }) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join('');

function renderComments(comments, rel) {
  if (!comments.length) return '<p class="empty">No comments yet. Be the first.</p>';
  return comments.map(c => {
    const who = c.data.link ? `<a href="${esc(c.data.link)}">${esc(c.data.name || 'Someone')}</a>` : esc(c.data.name || 'Someone');
    return `<div class="comment"><div class="who">${who}</div><div class="said"><p class="when">${fmtDate(c.date)}</p>${md(c.body, rel)}</div></div>`;
  }).join('');
}

function renderRecipeList(recipes, rel) {
  return `<ul class="recipes">${recipes.map(r => `<li><a href="${rel}cookbook/${esc(r.slug)}.html">${esc(r.title)}</a></li>`).join('')}</ul>`;
}

const categoriesOf = recipes => [...new Set(recipes.map(r => r.category))]
  .sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'en', { sensitivity: 'base' }));

// The full cookbook page: grouped by category when there are categories.
function renderCookbook(recipes, rel) {
  const cats = categoriesOf(recipes);
  if (cats.length === 1 && cats[0] === '') return renderRecipeList(recipes, rel);
  return cats.map(c => `<h3 class="cat" id="cat-${esc(slugify(c || 'more'))}">${esc(c || 'Everything else')}</h3>${renderRecipeList(recipes.filter(r => r.category === c), rel)}`).join('');
}

// The box on the profile: the whole list while it's short, then a summary.
function renderCookbookBox(recipes, rel, max = 15) {
  if (recipes.length <= max) return renderCookbook(recipes, rel);
  const cats = categoriesOf(recipes);
  const all = `<p class="viewall"><a href="${rel}cookbook/index.html">See all ${recipes.length} recipes</a></p>`;
  if (cats.length === 1 && cats[0] === '') return renderRecipeList(recipes.slice(0, max), rel) + all;
  return `<ul class="recipes">${cats.map(c => `<li><a href="${rel}cookbook/index.html#cat-${esc(slugify(c || 'more'))}">${esc(c || 'Everything else')}</a> (${recipes.filter(r => r.category === c).length})</li>`).join('')}</ul>${all}`;
}

function renderRecipe(r, rel) {
  const d = r.data;
  const facts = [d.serves && `Serves ${esc(d.serves)}`, d.time && esc(d.time)].filter(Boolean).join(' | ');
  const pic = d.photo ? photos([`${d.photo} | ${r.title}`], rel) : '';
  return `<article class="box recipe"><h2>${esc(r.title)}</h2>${facts ? `<p class="facts">${facts}</p>` : ''}${pic}<div class="recipe-body">${md(r.body, rel)}</div></article>`;
}

function feed(site, posts) {
  const items = posts.slice(0, 30).map(n => {
    const link = `${site.url}/posts/index.html#${n.slug}`;
    const pics = list(n.data.images).concat(list(n.data.image));
    const html = md(n.body, site.url + '/') + photos(pics, site.url + '/');
    const t = plain(n.body);
    const title = (t.length > 80 ? t.slice(0, 77).replace(/\s+\S*$/, '') + '...' : t) || fmtDate(n.date);
    return `<item><title>${esc(title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid><pubDate>${n.date.toUTCString()}</pubDate><description><![CDATA[${html}]]></description></item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(site.fullName)}</title><link>${site.url}/</link><description>Posts from ${esc(site.name)}'s profile.</description><language>en-us</language>
${items}
</channel></rss>
`;
}

function themeCSS(site, rel) {
  const color = /^#?[0-9a-f]{3,8}$/i.test(site.bgColor) ? (site.bgColor.startsWith('#') ? site.bgColor : '#' + site.bgColor) : '#030304';
  let image = 'none', size = 'auto';
  if (site.bgImage) { image = `url("${src(site.bgImage, rel)}")`; }
  else if (site.bgDots) { image = `radial-gradient(${site.bgDots} 1.6px, transparent 1.8px)`; size = '14px 14px'; }
  return `<style>:root{--page-bg:${color};--page-bg-image:${image};--page-bg-size:${size};}</style>`;
}

const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));

// ---------- build ----------

const t0 = Date.now();
const site = await loadSite();
const [posts, madeRaw, comments, recipesRaw, introSrc, meetSrc, interestsSrc, friendsSrc] = await Promise.all([
  readDir(path.join(CONTENT, 'posts')).then(dated),
  readDir(path.join(CONTENT, 'made')),
  readDir(path.join(CONTENT, 'comments')).then(dated),
  readRecipes(path.join(CONTENT, 'cookbook')),
  readText('intro.md'), readText('meet.md'), readText('interests.md'), readText('friends.md'),
]);
const made = madeRaw.sort((a, b) => (parseFloat(a.data.order) || 99) - (parseFloat(b.data.order) || 99) || a.name.localeCompare(b.name));
const recipes = loadRecipes(recipesRaw);
const friends = lines(friendsSrc).map(splitPipe).filter(f => f[0]);
const shown = posts.filter(n => n.body || list(n.data.images).length || n.data.image);

let films = [];
let newest = null;
const stats = {};
if (!OFFLINE) {
  if (site.letterboxd && site.filmsToShow > 0) {
    try { films = await letterboxdFilms(site.letterboxd, site.filmsToShow); }
    catch (e) { warn(`Letterboxd skipped: ${e.message}`); }
  }
  if (site.playlist) {
    try { newest = await spotifyNewest(site.playlist, 10); }
    catch (e) { warn(`Newest Spotify songs skipped, showing the plain playlist: ${e.message}`); }
  }
  for (const repo of new Set(made.map(m => m.data.github).filter(Boolean))) {
    try { const s = await githubStats(repo); if (s) stats[repo] = s; }
    catch (e) { warn(`GitHub stats for ${repo} skipped: ${e.message}`); }
  }
}

const latest = shown[0];
const mood = (latest && latest.data.mood) || site.mood;
const [tplIndex, tplPage] = await Promise.all([
  readFile(path.join(ROOT, 'template', 'index.html'), 'utf8'),
  readFile(path.join(ROOT, 'template', 'page.html'), 'utf8'),
]);

const shared = rel => ({
  rel,
  theme: themeCSS(site, rel),
  effect: site.effect,
  name: esc(site.name),
  full_name: esc(site.fullName),
  url: esc(site.url),
  host: esc(site.url.replace(/^https?:\/\//, '')),
  email: esc(site.email),
  github: esc(site.github),
  letterboxd: esc(site.letterboxd),
  year: String(NOW.getUTCFullYear()),
  recipes_nav: recipes.length ? `<a href="${rel}cookbook/index.html">Recipes</a>` : '',
  recipes_viewmy: recipes.length ? ` <span aria-hidden="true">/</span> <a href="${rel}cookbook/index.html">Recipes</a>` : '',
});
const hide = cond => (cond ? '' : 'hidden');

const onProfile = shown.slice(0, site.postsOnProfile);
const indexHtml = fill(tplIndex, {
  ...shared(''),
  portrait: site.portrait ? `<img src="${esc(thumb(site.portrait, 320, ''))}" alt="${esc(site.fullName)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'no-photo',textContent:'No photo'}))">` : '<span class="no-photo">No photo</span>',
  headline: esc(site.headline),
  location: esc(site.location),
  status: renderStatus(latest),
  mood: mood ? `<p class="mood">Mood: <strong>${esc(mood)}</strong></p>` : '',
  music: (() => {
    const sp = spotifyEmbed(site.playlist);
    if (site.playlist && !sp) warn('playlist in site.md is not a Spotify link I recognize');
    if (sp && newest && newest.length) {
      const top = newest[0];
      const player = `<iframe class="sp-player" title="Newest song on ${esc(site.name)}'s playlist" src="https://open.spotify.com/embed/track/${esc(top.id)}?utm_source=generator&theme=0" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
      const row = (t, i) => `<li${i === 0 ? ' class="on"' : ''}><a href="https://open.spotify.com/track/${esc(t.id)}" data-track="${esc(t.id)}">${esc(t.title)}</a> <span class="by">· ${esc(t.artists)}</span></li>`;
      return `${player}<p class="sp-label">Newest on the playlist</p><ol class="sp-list">${newest.map(row).join('')}</ol><p class="music-link"><a href="${esc(sp.link)}">Open the whole playlist in Spotify</a></p>`;
    }
    const spotify = sp ? `<iframe title="${esc(site.name)}'s playlist on Spotify" src="${esc(sp.embed)}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe><p class="music-link"><a href="${esc(sp.link)}">Open in Spotify</a></p>` : '';
    const song = site.song ? `<p class="now">${esc(site.songTitle || 'Profile song')}</p><audio controls preload="none" src="${esc(src(site.song, ''))}"></audio>` : '';
    return song + spotify;
  })(),
  music_box: hide(site.song || spotifyEmbed(site.playlist)),
  intro: md(introSrc, ''),
  meet: meetSrc.trim() ? `<h3>Who I'd like to meet:</h3>${md(meetSrc, '')}` : '',
  posts: onProfile.length ? onProfile.map(n => renderPost(n, '')).join('\n') : '<p class="empty">No posts yet.</p>',
  posts_more: shown.length > onProfile.length ? `<p class="viewall"><a href="posts/index.html">See older posts</a></p>` : '',
  friends: renderFriends(friends, '') + (friends.length > 8 ? `<p class="viewall"><a href="friends/index.html">View all ${friends.length} friends</a></p>` : ''),
  friend_count: String(friends.length),
  friends_box: hide(friends.length),
  made: renderMade(made, stats, ''),
  made_box: hide(made.length),
  recipes: renderCookbookBox(recipes, ''),
  recipe_count: String(recipes.length),
  recipes_box: hide(recipes.length),
  interests: renderInterests(interestsSrc, films, ''),
  details: renderDetails(site.details),
  details_box: hide(site.details.length),
  comments: renderComments(comments, ''),
  comment_count: String(comments.length),
});

const page = (rel, title, crumbs, body) => fill(tplPage, { ...shared(rel), page_title: esc(title), crumbs, body });
const crumb = (rel, ...parts) => `<a href="${rel}index.html">${esc(site.name)}'s profile</a> &gt; ${parts.join(' &gt; ')}`;

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, 'posts'), { recursive: true });
await mkdir(path.join(OUT, 'cookbook'), { recursive: true });
if (friends.length > 8) await mkdir(path.join(OUT, 'friends'), { recursive: true });

const writes = [
  writeFile(path.join(OUT, 'index.html'), indexHtml),
  writeFile(path.join(OUT, 'posts', 'index.html'), page('../', `${site.fullName}'s posts`, crumb('../', 'Posts'),
    `<h1>${esc(site.name)}'s Posts <a class="sub" href="feed.xml">Subscribe</a></h1><section class="box posts-all">${shown.map(n => renderPost(n, '../')).join('\n') || '<p class="empty">No posts yet.</p>'}</section>`)),
  writeFile(path.join(OUT, 'posts', 'feed.xml'), feed(site, shown)),
  writeFile(path.join(OUT, 'cookbook', 'index.html'), page('../', `${site.fullName}'s cookbook`, crumb('../', 'Cookbook'),
    `<h1>${esc(site.name)}'s Cookbook</h1><section class="box cookbook-all">${recipes.length ? renderCookbook(recipes, '../') : '<p class="empty">No recipes yet.</p>'}</section>`)),
  ...recipes.map(r => writeFile(path.join(OUT, 'cookbook', `${r.slug}.html`), page('../', `${r.title}, from ${site.name}'s cookbook`,
    crumb('../', `<a href="index.html">Cookbook</a>`, ...(r.category ? [`<a href="index.html#cat-${esc(slugify(r.category))}">${esc(r.category)}</a>`] : []), esc(r.title)), renderRecipe(r, '../')))),
  cp(path.join(ROOT, 'template', 'style.css'), path.join(OUT, 'style.css')),
  cp(path.join(ROOT, 'template', 'site.js'), path.join(OUT, 'site.js')),
  cp(path.join(ROOT, 'template', 'favicon.svg'), path.join(OUT, 'favicon.svg')),
  cp(path.join(ROOT, 'template', 'favicon-32.png'), path.join(OUT, 'favicon-32.png')),
  cp(path.join(ROOT, 'template', 'apple-touch-icon.png'), path.join(OUT, 'apple-touch-icon.png')),
  cp(path.join(ROOT, 'template', 'fonts'), path.join(OUT, 'fonts'), { recursive: true }),
  cp(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true }),
];
if (friends.length > 8) writes.push(writeFile(path.join(OUT, 'friends', 'index.html'), page('../', `${site.fullName}'s friends`, crumb('../', 'Friends'),
  `<h1>${esc(site.name)}'s Friends</h1><section class="box friends-all"><p class="count">${esc(site.name)} has <strong>${friends.length}</strong> friends.</p>${renderFriends(friends, '../', Infinity)}</section>`)));
writes.push(buildMedia());
await Promise.all(writes);

console.log(`Built ${shown.length} posts, ${made.length} projects, ${recipes.length} recipes, ${friends.length} friends, ${comments.length} comments, ${films.length} films${Object.keys(stats).length ? ', GitHub stats' : ''} in ${Date.now() - t0} ms.`);
