// Tests du widget Übersicht : vérifications statiques du JSX, puis rendu réel
// dans Chromium (esbuild + React 18 + Playwright) avec le cycle de vie Übersicht
// reproduit par tests/harness/. Le rendu est SAUTÉ si un outil manque.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WIDGET_DIR = path.join(ROOT, 'widget/mur-des-retournements.widget');
const JSX_PATH = path.join(WIDGET_DIR, 'mur-des-retournements.jsx');
const HARNESS_DIR = path.join(HERE, 'harness');
const FORBIDDEN_REPO = ['spicy', 'x9'].join(''); // écrit en deux morceaux pour ne pas se détecter soi-même

const read = (p) => readFileSync(p, 'utf8');
const jsx = existsSync(JSX_PATH) ? read(JSX_PATH) : '';

const exportsName = (src, name) =>
  new RegExp(`export\\s+(?:const|let|var|function|async\\s+function)\\s+${name}\\b`).test(src) ||
  new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(src);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (['.git', 'node_modules'].includes(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.size < 2_000_000) out.push(full);
  }
  return out;
}

describe('JSX : vérifications statiques', () => {
  test('le point d’entrée existe', () => {
    assert.ok(jsx.length > 0, `fichier introuvable ou vide : ${JSX_PATH}`);
  });
  for (const name of ['refreshFrequency', 'command', 'init', 'updateState', 'render', 'className']) {
    test(`exporte ${name}`, () => assert.ok(exportsName(jsx, name), `export ${name} manquant`));
  }
  test('importe ./lib/state.js et ./lib/sync.js', () => {
    assert.match(jsx, /from\s+['"]\.\/lib\/state\.js['"]/);
    assert.match(jsx, /from\s+['"]\.\/lib\/sync\.js['"]/);
  });
  test('contient l’URL du dépôt aaxxeell09/Success', () => {
    assert.match(jsx, /aaxxeell09\/Success/);
  });
  test(`aucune référence au dépôt ${FORBIDDEN_REPO.slice(0, 5)}… dans le projet`, () => {
    // CLAUDE.md énonce l'interdiction et tests/ la vérifie : ces fichiers sont exclus.
    const hits = walk(ROOT)
      .filter((f) => !f.startsWith(path.join(ROOT, 'tests') + path.sep) && path.basename(f) !== 'CLAUDE.md')
      .filter((f) => { try { return read(f).includes(FORBIDDEN_REPO); } catch { return false; } })
      .map((f) => path.relative(ROOT, f));
    assert.deepEqual(hits, []);
  });
  test('les modules lib/ sont purs (pas d’import uebersicht ni de JSX)', () => {
    for (const name of ['state.js', 'sync.js']) {
      const p = path.join(WIDGET_DIR, 'lib', name);
      assert.ok(existsSync(p), `module manquant : lib/${name}`);
      const src = read(p);
      assert.doesNotMatch(src, /from\s+['"]uebersicht['"]/, `lib/${name} importe uebersicht`);
      assert.doesNotMatch(src, /return\s*\(?\s*<[A-Za-z]/, `lib/${name} contient du JSX`);
    }
  });
  test('plus de taille S/M/L dans le JSX (ni SIZES, ni SIZE, ni « Taille »)', () => {
    assert.doesNotMatch(jsx, /\bSIZES?\b/, 'SIZES ou SIZE encore référencé');
    assert.doesNotMatch(jsx, /Taille\s+(?:S|M|L|petite|moyenne|grande|du widget)\b/, 'libellé « Taille » S/M/L encore présent');
    assert.match(jsx, /CARD_WIDTH/, 'la largeur doit venir de CARD_WIDTH (lib/state.js)');
  });
  test('plus de crédit photo affiché ni de titre dans le JSX', () => {
    assert.doesNotMatch(jsx, /Photo\s*:/, 'texte « Photo : » encore présent');
    assert.doesNotMatch(jsx, /data-role="credit"/, 'bloc de crédit encore présent');
    assert.doesNotMatch(jsx, />\s*(?:Le )?mur des retournements\s*</i, 'titre visible encore présent');
  });
  test('aucun tiret cadratin ni demi-cadratin dans le widget et le README', () => {
    const files = [JSX_PATH, path.join(ROOT, 'README.md'), path.join(ROOT, 'CREDITS.md'),
      ...['state.js', 'sync.js'].map((n) => path.join(WIDGET_DIR, 'lib', n))].filter(existsSync);
    const bad = [];
    for (const f of files) {
      read(f).split('\n').forEach((line, i) => {
        if (/[–—]/.test(line)) bad.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    assert.deepEqual(bad, []);
  });
});

// ---------------------------------------------------------------------------
// Rendu réel dans Chromium
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const bases = [import.meta.url];
  for (const dir of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)) bases.push(path.join(dir, 'x.js'));
  try { bases.push(path.join(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'x.js')); } catch { /* npm absent */ }
  for (const base of bases) {
    try { return createRequire(base)('playwright'); } catch { /* suivant */ }
  }
  return null;
}

async function setup() {
  if (!jsx) return { reason: 'JSX introuvable' };
  let esbuild;
  try { esbuild = await import('esbuild'); } catch { return { reason: 'esbuild indisponible (npm install)' }; }
  try { require.resolve('react'); require.resolve('react-dom/client'); } catch { return { reason: 'react/react-dom indisponibles (npm install)' }; }
  const playwright = loadPlaywright();
  if (!playwright) return { reason: 'playwright indisponible' };
  let browser;
  try { browser = await playwright.chromium.launch(); } catch (err) {
    return { reason: `Chromium non lançable : ${String(err.message).split('\n')[0]}` };
  }
  const { buildHarness } = await import(pathToFileURL(path.join(HARNESS_DIR, 'build.mjs')).href);
  let bundle;
  try { bundle = await buildHarness(esbuild); } catch (err) {
    await browser.close();
    throw new Error(`Échec du bundle esbuild du widget : ${err.message}`);
  }
  return { browser, bundle };
}

const env = await setup();
const skip = env.reason ? `rendu sauté : ${env.reason}` : false;

const ORIGIN = 'http://ubersicht.test';
// PNG 1x1 valide, servi pour toute image distante (aucun accès réseau réel).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Contrat v3 : carte en anglais, taille fixe CARD_WIDTH x CARD_HEIGHT, photo de 172 px.
const CARD_W = 350;
const CARD_H = 490;
const PHOTO_H = 172;
// Mots français typiques (mots entiers, insensible à la casse) : aucun ne doit
// apparaître dans le texte visible ni dans title/aria-label/alt. Les noms propres
// accentués (José Hernández) ne sont pas concernés.
const FRENCH = /(?<![\p{L}\p{N}])(?:le|la|les|de|des|du|au|aux|une|est|et|il|elle|sur|pour|avec|dans|à|où|qui|personne|précédente|suivante|reprendre|hors connexion|en pause|ans)(?![\p{L}\p{N}])|synchronis/iu;

// Contrat v2 : liste blanche stricte, dans cet ordre.
const WHITELIST = ['valdas', 'elon', 'mandela', 'trump', 'chesky', 'collison', 'pope', 'jose', 'thatcher'];
// Les 11 personnes retirées (ancienne liste à 20) : ne doivent plus jamais revenir.
const RETIRED = ['kariko', 'rdj', 'dej', 'jensen', 'dyson', 'melanie', 'jobs', 'tina', 'knight', 'jan', 'niel'];
const CACHE_V1 = 'mur-des-retournements-stories-cache-v1';
const PREFS_V2 = 'mur-des-retournements-settings-v2';
const retiredStory = (id) => ({ id, name: `Retired ${id}`, lowest: `Retired trial ${id}.`, comeback: `Retired turnaround ${id}.` });
// Ancien cache v1 tel que l'écrivait le widget à 20 personnes.
const oldCacheV1 = (local) => JSON.stringify({
  version: 1, savedAt: Date.parse('2026-01-01T00:00:00Z'),
  stories: [...local, ...RETIRED.map(retiredStory)],
});

// Données initiales du stockage, écrites une seule fois (pas à chaque rechargement).
async function seedStorage(context, entries) {
  await context.addInitScript((items) => {
    try {
      if (localStorage.getItem('__seeded')) return;
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
      localStorage.setItem('__seeded', '1');
    } catch (_) { /* stockage indisponible */ }
  }, entries);
}

async function openWidget(context, { online = true, remote = null, clock = false } = {}) {
  const page = await context.newPage();
  page.on('pageerror', (e) => { page.__errors = [...(page.__errors || []), String(e)]; });
  await page.addInitScript(([o, r]) => { window.__NET_INIT = { online: o, remote: r }; }, [online, remote]);
  if (clock) await page.clock.install({ time: new Date('2026-01-05T09:00:00Z') });
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => window.__harness && window.__harness.ready && window.__harness.renders > 0);
  return page;
}

// Sert le harnais, le dossier du widget et l'aperçu ; toute image distante reçoit
// un PNG 1x1 ; tout autre accès réseau est coupé.
async function route(context, bundle) {
  await context.route('**/*', async (r) => {
    const url = new URL(r.request().url());
    if (url.origin === ORIGIN) {
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (rel === 'bundle.js') return r.fulfill({ status: 200, contentType: TYPES['.js'], body: bundle });
      let file = null;
      if (rel.startsWith('mur-des-retournements.widget/')) file = path.join(WIDGET_DIR, rel.slice('mur-des-retournements.widget/'.length));
      else if (['index.html', 'mock-network.js'].includes(rel)) file = path.join(HARNESS_DIR, rel);
      else if (rel.startsWith('repo/')) file = path.join(ROOT, rel.slice('repo/'.length));
      if (file && file.startsWith(ROOT) && !file.includes(`${path.sep}node_modules${path.sep}`) && existsSync(file) && statSync(file).isFile()) {
        return r.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: readFileSync(file) });
      }
      return r.fulfill({ status: 404, body: 'introuvable' });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return r.abort();
  });
}

// Lecture de l'interface : textes, compteur, boutons, largeur, image, sections.
const snapshot = (page, rootSel = '#widget') => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  const card = root.matches('article') ? root : (root.querySelector('article') || root.firstElementChild);
  const text = root.innerText || '';
  const counter = text.match(/(\d+)\s*\/\s*(\d+)/);
  const h = window.__harness;
  const s = h ? h.state : {};
  const current = h ? ((s.stories || []).find((x) => x.id === s.currentId) || null) : null;
  const imgs = [...root.querySelectorAll('img')].filter((i) => getComputedStyle(i).display !== 'none' && !i.hidden && i.getAttribute('src'));
  const rect = card ? card.getBoundingClientRect() : { width: 0, height: 0, left: 0, right: 0 };
  const at25 = root.querySelector('[data-role="at25"]');
  const hl = root.querySelector('[data-role="headline"]');
  const hlVisible = !!hl && hl.offsetParent !== null && !hl.hidden && getComputedStyle(hl).display !== 'none' && hl.textContent.trim() !== '';
  const photoBox = (() => { const im = root.querySelector('img'); return im ? im.parentElement : null; })();
  const buttons = [...root.querySelectorAll('button, [role="button"]')].filter((b) => !b.hidden && getComputedStyle(b).display !== 'none');
  return {
    text,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    lang: card ? card.getAttribute('lang') : null,
    cardLabel: card ? card.getAttribute('aria-label') : null,
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    viewport: window.innerWidth,
    counter: counter ? [Number(counter[1]), Number(counter[2])] : null,
    currentId: h ? s.currentId : null,
    currentName: current && current.name,
    paused: h ? s.paused : null,
    hasSizeField: h ? 'size' in s : false,
    ids: h ? (s.stories || []).map((x) => x.id) : [],
    total: h ? (s.stories || []).length : (counter ? Number(counter[2]) : 0),
    syncError: h ? s.syncError : null,
    loadedImage: imgs.some((i) => i.complete && i.naturalWidth > 0),
    imageSrc: imgs.length ? imgs[0].currentSrc || imgs[0].src : null,
    imageWidth: imgs.length ? imgs[0].naturalWidth : 0,
    headline: hlVisible ? hl.textContent.trim() : null,
    headlineOnPhoto: hlVisible && !!photoBox && photoBox.contains(hl),
    at25Visible: !!at25 && at25.offsetParent !== null && getComputedStyle(at25).display !== 'none',
    buttons: buttons.map((b) => ({ text: b.textContent.trim(), label: `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`.trim() })),
    errors: h ? h.errors : [],
  };
}, rootSel);

// Boutons repérés par leur aria-label/title anglais (contrat v3).
const BUTTONS = {
  prev: (t, l) => /^Previous person\b/.test(l),
  next: (t, l) => /^Next person\b/.test(l),
  pause: (t, l) => /^(?:Pause automatic rotation|Resume automatic rotation \(every 20 minutes\))(?:\s|$)/.test(l),
};
const PAUSE_LABEL = 'Pause automatic rotation';
const RESUME_LABEL = 'Resume automatic rotation (every 20 minutes)';

async function button(page, kind, rootSel = '#widget') {
  const handles = await page.$$(`${rootSel} button, ${rootSel} [role="button"]`);
  for (const h of handles) {
    const [t, l] = await h.evaluate((el) => [el.textContent.trim(), `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`]);
    if (BUTTONS[kind](t, l)) return h;
  }
  throw new Error(`bouton introuvable : ${kind}`);
}
const signature = (h) => h.evaluate((el) => `${el.textContent.trim()}|${el.getAttribute('aria-label')}|${el.getAttribute('title')}|${el.innerHTML}`);
const click = async (page, kind, rootSel) => { await (await button(page, kind, rootSel)).click(); await page.waitForTimeout(30); };
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 });
const waitImage = (page, rootSel = '#widget') => until(page,
  (sel) => [...document.querySelectorAll(`${sel} img`)].some((i) => !i.hidden && i.complete && i.naturalWidth > 0), rootSel);

// Géométrie de la carte v3 : article > [bloc photo, zone [data-role=content], nav].
const layout = (page, rootSel = '#widget') => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  const card = root.matches('article') ? root : root.querySelector('article');
  const box = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, left: Math.round(b.left * 10) / 10, width: Math.round(b.width * 10) / 10, height: Math.round(b.height * 10) / 10 }; };
  const kids = [...card.children];
  const content = card.querySelector('[data-role="content"]');
  const nav = card.querySelector('nav');
  const cs = getComputedStyle(card);
  const ccs = content ? getComputedStyle(content) : {};
  return {
    card: box(card),
    boxSizing: cs.boxSizing, display: cs.display, flexDirection: cs.flexDirection, overflow: cs.overflow,
    children: kids.map((el) => (el.tagName === 'NAV' ? 'nav' : el.getAttribute('data-role') || (el.querySelector('img, [aria-hidden]') ? 'photo' : el.tagName.toLowerCase()))),
    photo: kids[0] ? { ...box(kids[0]), flexShrink: getComputedStyle(kids[0]).flexShrink, hasImg: !!kids[0].querySelector('img'), hasHeadline: !!kids[0].querySelector('[data-role="headline"]'), hasCounter: /\d+\s*\/\s*\d+/.test(kids[0].innerText) } : null,
    contentIndex: kids.indexOf(content),
    content: content ? { ...box(content), scrollHeight: content.scrollHeight, clientHeight: content.clientHeight, scrollTop: content.scrollTop, overflowY: ccs.overflowY, flexGrow: ccs.flexGrow, flexShrink: ccs.flexShrink, minHeight: ccs.minHeight, sections: [...content.querySelectorAll('section[data-role]')].map((x) => x.getAttribute('data-role')) } : null,
    navIndex: kids.indexOf(nav),
    nav: nav ? { ...box(nav), label: nav.getAttribute('aria-label'), flexShrink: getComputedStyle(nav).flexShrink, justify: getComputedStyle(nav).justifyContent } : null,
    buttons: nav ? [...nav.querySelectorAll('button')].map((b) => ({ ...box(b), label: b.getAttribute('aria-label'), title: b.getAttribute('title') })) : [],
  };
}, rootSel);

// Tous les textes lisibles : innerText + title/aria-label/alt de l'article et de ses descendants.
const visibleStrings = (page, rootSel = '#widget') => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  const card = root.matches('article') ? root : root.querySelector('article');
  const out = [card.innerText];
  for (const el of [card, ...card.querySelectorAll('*')]) {
    for (const a of ['title', 'aria-label', 'alt']) { const v = el.getAttribute(a); if (v) out.push(v); }
  }
  return out;
}, rootSel);
async function assertNoFrench(page, rootSel, where) {
  for (const str of await visibleStrings(page, rootSel)) {
    const m = str.match(FRENCH);
    assert.equal(m, null, `${where} : mot français « ${m && m[0]} » dans « ${str.slice(0, 160)} »`);
  }
}

// Contrôle de la géométrie v3 (taille fixe, structure, nav en bas).
function assertV3Layout(g, where, width = CARD_W) {
  assert.ok(Math.abs(g.card.width - width) <= 1, `${where} : largeur ${g.card.width} (attendu ${width})`);
  assert.ok(Math.abs(g.card.height - CARD_H) <= 1, `${where} : hauteur ${g.card.height} (attendu ${CARD_H})`);
  assert.equal(g.boxSizing, 'border-box');
  assert.equal(g.display, 'flex');
  assert.equal(g.flexDirection, 'column');
  assert.equal(g.overflow, 'hidden');
  assert.equal(g.contentIndex, 1, `${where} : [data-role=content] doit être le 2e enfant (${g.children})`);
  assert.equal(g.navIndex, 2, `${where} : nav doit être le 3e enfant (${g.children})`);
  assert.ok(g.photo.hasImg && g.photo.hasHeadline !== undefined && g.photo.hasCounter, `${where} : bloc photo (img + compteur)`);
  assert.ok(Math.abs(g.photo.height - PHOTO_H) <= 0.5, `${where} : bloc photo ${g.photo.height} (attendu ${PHOTO_H})`);
  assert.equal(g.photo.flexShrink, '0', `${where} : bloc photo flex none`);
  assert.equal(g.content.overflowY, 'auto');
  assert.equal(g.content.flexGrow, '1');
  assert.equal(g.content.minHeight, '0px');
  assert.equal(g.nav.label, 'Widget controls');
  assert.equal(g.nav.flexShrink, '0', `${where} : nav flex none`);
  assert.equal(g.nav.justify, 'center');
  assert.equal(g.buttons.length, 3);
  const bottom = g.nav.top + g.nav.height;
  assert.ok(Math.abs(g.card.top + g.card.height - bottom) <= 1.5, `${where} : nav collée en bas (${bottom} / ${g.card.top + g.card.height})`);
  const mid = g.card.left + g.card.width / 2;
  const span = [Math.min(...g.buttons.map((b) => b.left)), Math.max(...g.buttons.map((b) => b.left + b.width))];
  assert.ok(Math.abs((span[0] + span[1]) / 2 - mid) <= 1.5, `${where} : boutons centrés (${span} / ${mid})`);
}

// Interface v3 : 3 boutons, aucun S/M/L, aucun titre, aucun crédit ni citation, anglais.
function assertV3Card(s, story) {
  assert.doesNotMatch(s.text, /le mur des retournements/i, 'le titre du widget ne doit pas être affiché');
  assert.doesNotMatch(s.text, /Photo\s*:/, 'aucun crédit « Photo : » affiché');
  assert.equal(s.buttons.length, 3, `exactement 3 boutons, trouvés : ${JSON.stringify(s.buttons)}`);
  for (const k of ['S', 'M', 'L']) {
    assert.ok(!s.buttons.some((b) => b.text === k || new RegExp(`\\(${k}\\)|taille`, 'i').test(b.label)), `aucun bouton ${k}`);
  }
  const kinds = s.buttons.map((b) => Object.keys(BUTTONS).find((k) => BUTTONS[k](b.text, b.label)));
  assert.deepEqual([...kinds].sort(), ['next', 'pause', 'prev'], `boutons attendus : précédent, suivant, pause ; reçus ${JSON.stringify(s.buttons)}`);
  assert.equal(s.lang, 'en', 'article lang="en"');
  assert.equal(s.cardLabel, 'Success stories');
  assert.match(s.text, /LOWEST POINT/);
  assert.match(s.text, /TURNAROUND/);
  assert.doesNotMatch(s.text, /au plus bas|le retournement|à 25 ans/i, 'anciens libellés français');
  if (story) {
    assert.ok(s.text.includes(story.name), `nom « ${story.name} » affiché`);
    if (story.category) assert.ok(s.text.includes(story.category.split(' · ')[0]), 'catégorie affichée');
    assert.ok(s.text.includes(story.lowest.slice(0, 30)), 'récit « au plus bas » affiché');
    assert.ok(s.text.includes(story.comeback.slice(0, 30)), 'récit du retournement affiché');
    for (const k of ['image_credit', 'image_license']) {
      if (typeof story[k] === 'string' && story[k].trim()) assert.ok(!s.text.includes(story[k]), `${k} ne doit pas être visible`);
    }
    if (typeof story.lesson === 'string' && story.lesson.trim()) {
      assert.ok(!s.text.includes(story.lesson.slice(0, 25)), 'la citation (lesson) ne doit pas être affichée');
    }
    if (typeof story.headline === 'string' && story.headline.trim()) {
      assert.ok(s.headline && s.headline.includes(story.headline.slice(0, 30)), `accroche (headline) affichée pour ${story.id} : ${s.headline}`);
      assert.ok(s.headlineOnPhoto, 'accroche superposée à la photo, sous le nom');
    } else {
      assert.equal(s.headline, null, `aucune accroche pour ${story.id}`);
    }
    if (typeof story.at25 === 'string' && story.at25.trim()) {
      assert.match(s.text, /AT 25/, `section « AT 25 » attendue pour ${story.id}`);
      assert.ok(s.text.includes(story.at25.slice(0, 30)), 'texte at25 affiché');
    } else {
      assert.doesNotMatch(s.text, /AT 25/, `section « AT 25 » absente pour ${story.id}`);
      assert.equal(s.at25Visible, false);
    }
  }
}

describe('rendu réel du widget (Chromium)', { skip }, () => {
  let context;
  let page;
  let local;
  const byId = (id) => local.find((x) => x.id === id);
  const ADDED = { id: 'ajout-harnais', name: 'Harness Added Person', lowest: 'Trial added on GitHub.', comeback: 'Turnaround added on GitHub.' };
  // Revient à la première carte (navigation circulaire avec ›).
  const backToFirst = async (p = page) => {
    for (let i = 0; i < 12 && (await snapshot(p)).currentId !== WHITELIST[0]; i += 1) await click(p, 'next');
    assert.equal((await snapshot(p)).currentId, WHITELIST[0]);
  };

  before(async () => {
    local = JSON.parse(read(path.join(WIDGET_DIR, 'stories.json')));
    context = await env.browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await route(context, env.bundle);
    page = await openWidget(context, { online: true, remote: local, clock: true });
    await until(page, () => window.__net.calls.some((c) => c.url.includes('stories.json')));
  });
  after(async () => {
    await context?.close();
  });

  test('copie embarquée = liste blanche des 9 personnes', () => {
    assert.deepEqual(local.map((x) => x.id), WHITELIST);
  });

  test('carte initiale : sans titre ni crédit, 3 boutons, compteur 1 / 9 sur la photo, 350 × 490', async () => {
    const s = await snapshot(page);
    assert.deepEqual(s.errors, []);
    assert.equal(s.currentId, WHITELIST[0]);
    assertV3Card(s, byId(s.currentId));
    assert.deepEqual(s.counter, [1, 9]);
    assert.match(s.text, /1 \/ 9/);
    const counterOnPhoto = await page.evaluate(() => {
      const card = document.querySelector('#widget article');
      const img = card && card.querySelector('img');
      const photo = img ? img.parentElement : card && card.firstElementChild;
      return !!photo && [...photo.querySelectorAll('span, div')].some((el) => /^\s*\d+\s*\/\s*\d+\s*$/.test(el.textContent));
    });
    assert.ok(counterOnPhoto, 'compteur de navigation superposé à la photo');
    assert.ok(Math.abs(s.width - CARD_W) <= 1, `largeur ≈ ${CARD_W} px, mesurée ${s.width}`);
    assert.ok(Math.abs(s.height - CARD_H) <= 1, `hauteur ≈ ${CARD_H} px, mesurée ${s.height}`);
    assertV3Layout(await layout(page), 'carte initiale');
    const labels = (await layout(page)).buttons.map((b) => [b.label, b.title]);
    assert.deepEqual(labels, [['Previous person', 'Previous person'], ['Next person', 'Next person'], [PAUSE_LABEL, PAUSE_LABEL]]);
    const alt = await page.evaluate(() => document.querySelector('#widget article img').getAttribute('alt'));
    assert.equal(alt, `Portrait of ${byId(WHITELIST[0]).name}`);
    assert.equal(s.hasSizeField, false, 'state.size ne doit plus exister');
    await waitImage(page);
  });

  test('parcours complet des 9 cartes avec › : noms, photos locales, section À 25 ANS', async () => {
    for (let i = 0; i < WHITELIST.length; i += 1) {
      await waitImage(page);
      const s = await snapshot(page);
      const story = byId(WHITELIST[i]);
      assert.equal(s.currentId, WHITELIST[i], `carte ${i + 1}`);
      assert.deepEqual(s.counter, [i + 1, 9]);
      assert.ok(s.text.includes(story.name), `nom exact « ${story.name} »`);
      assertV3Card(s, story);
      assert.ok(s.loadedImage && s.imageWidth > 1, `photo chargée pour ${story.id} (naturalWidth ${s.imageWidth})`);
      assert.ok(s.imageSrc.startsWith(`${ORIGIN}/mur-des-retournements.widget/photos/`), `photo servie localement : ${s.imageSrc}`);
      await click(page, 'next');
    }
    const back = await snapshot(page);
    assert.equal(back.currentId, WHITELIST[0], 'retour circulaire à la première carte');
  });

  test('taille fixe 350 × 490 sur les 9 cartes : photo 172 px, nav et boutons immobiles', async () => {
    const all = [];
    for (let i = 0; i < WHITELIST.length; i += 1) {
      const g = await layout(page);
      assertV3Layout(g, WHITELIST[i]);
      all.push(g);
      await click(page, 'next');
    }
    const ref = all[0];
    for (let i = 1; i < all.length; i += 1) {
      const g = all[i];
      assert.deepEqual(g.card, ref.card, `${WHITELIST[i]} : carte identique à la première`);
      assert.deepEqual({ top: g.nav.top, left: g.nav.left, width: g.nav.width, height: g.nav.height },
        { top: ref.nav.top, left: ref.nav.left, width: ref.nav.width, height: ref.nav.height }, `${WHITELIST[i]} : nav immobile`);
      g.buttons.forEach((b, k) => {
        const r = ref.buttons[k];
        assert.deepEqual([b.top, b.left, b.width, b.height], [r.top, r.left, r.width, r.height], `${WHITELIST[i]} : bouton ${k + 1} immobile`);
      });
      assert.equal(g.photo.height, ref.photo.height, `${WHITELIST[i]} : bloc photo constant`);
      assert.equal(g.content.clientHeight, ref.content.clientHeight, `${WHITELIST[i]} : zone texte de hauteur constante`);
    }
    assert.equal((await snapshot(page)).currentId, WHITELIST[0]);
  });

  test('seule la zone de texte défile, remise en haut à chaque changement de personne', async () => {
    const scrolling = [];
    for (let i = 0; i < WHITELIST.length; i += 1) {
      const g = await layout(page);
      assert.equal(g.content.overflowY, 'auto');
      if (g.content.scrollHeight > g.content.clientHeight + 1) scrolling.push(i);
      await click(page, 'next');
    }
    assert.ok(scrolling.length >= 1, 'au moins une carte réelle a un texte plus long que la zone visible');
    const target = WHITELIST[scrolling[0]];
    for (let i = 0; i < 12 && (await snapshot(page)).currentId !== target; i += 1) await click(page, 'next');
    await page.evaluate(() => { document.querySelector('#widget [data-role="content"]').scrollTop = 50; });
    const scrolled = await layout(page);
    assert.ok(scrolled.content.scrollTop > 0, `défilement effectif (${scrolled.content.scrollTop})`);
    assert.ok(Math.abs(scrolled.card.height - CARD_H) <= 1, 'la carte ne grandit pas');
    await click(page, 'next');
    assert.equal((await layout(page)).content.scrollTop, 0, 'personne suivante : zone en haut');
    await click(page, 'prev');
    const back = await layout(page);
    assert.equal((await snapshot(page)).currentId, target);
    assert.equal(back.content.scrollTop, 0, 'retour : zone en haut');
    assert.ok(Math.abs(back.card.height - CARD_H) <= 1);
    await backToFirst();
  });

  test('aucun texte français visible (texte, title, aria-label, alt) sur les 9 cartes', async () => {
    for (let i = 0; i < WHITELIST.length; i += 1) {
      await assertNoFrench(page, '#widget', WHITELIST[i]);
      await click(page, 'next');
    }
    assert.equal((await snapshot(page)).currentId, WHITELIST[0]);
  });

  test('catégorie de Thatcher : « Politics · United Kingdom » (données et rendu)', async () => {
    assert.equal(byId('thatcher').category, 'Politics · United Kingdom');
    await click(page, 'prev');
    const s = await snapshot(page);
    assert.equal(s.currentId, 'thatcher');
    const shown = await page.evaluate(() => [...document.querySelectorAll('#widget article div')]
      .some((el) => el.children.length === 0 && el.textContent.trim() === 'Politics · United Kingdom'));
    assert.ok(shown, 'catégorie affichée telle quelle');
    await click(page, 'next');
    assert.equal((await snapshot(page)).currentId, WHITELIST[0]);
  });

  test('‹ et › changent de personne (navigation circulaire)', async () => {
    const a = await snapshot(page);
    await click(page, 'next');
    const b = await snapshot(page);
    assert.notEqual(b.currentId, a.currentId);
    assert.deepEqual(b.counter, [2, 9]);
    await click(page, 'prev');
    assert.equal((await snapshot(page)).currentId, a.currentId);
    await click(page, 'prev');
    assert.deepEqual((await snapshot(page)).counter, [9, 9], 'vers la dernière');
    await click(page, 'next');
    assert.deepEqual((await snapshot(page)).counter, [1, 9]);
  });

  test('pause change l’icône et bloque la rotation ; rotation toutes les 20 minutes', async () => {
    const before = await signature(await button(page, 'pause'));
    const start = await snapshot(page);
    assert.match(before, new RegExp(`\\|${PAUSE_LABEL}\\|${PAUSE_LABEL}\\|`));
    await click(page, 'pause');
    assert.notEqual(await signature(await button(page, 'pause')), before, 'l’icône de pause doit changer');
    assert.match(await signature(await button(page, 'pause')), /\|Resume automatic rotation \(every 20 minutes\)\|/);
    assert.equal((await snapshot(page)).paused, true);
    await page.clock.fastForward('41:00');
    await page.waitForTimeout(50);
    assert.equal((await snapshot(page)).currentId, start.currentId, 'pas de rotation en pause');
    await click(page, 'pause');
    assert.equal(await signature(await button(page, 'pause')), before);
    await page.clock.fastForward('18:00');
    await page.waitForTimeout(50);
    assert.equal((await snapshot(page)).currentId, start.currentId, 'pas d’avance avant 20 minutes');
    await page.clock.fastForward('03:00');
    await until(page, (id) => window.__harness.state.currentId !== id, start.currentId);
    const s = await snapshot(page);
    assert.equal(s.currentId, WHITELIST[(WHITELIST.indexOf(start.currentId) + 1) % 9], 'avance d’une carte');
  });

  test('hors connexion : indicateur affiché, données conservées', async () => {
    const a = await snapshot(page);
    await page.evaluate(() => { window.__net.online = false; return window.__harness.runCommand(); });
    await until(page, () => /\boffline\b/.test(document.getElementById('widget').innerText));
    const b = await snapshot(page);
    const tip = await page.evaluate(() => [...document.querySelectorAll('#widget [title]')].map((e) => e.getAttribute('title')).find((t) => /^Sync failed/.test(t)));
    assert.ok(tip, 'infobulle « Sync failed ... »');
    await assertNoFrench(page, '#widget', 'hors connexion');
    assertV3Layout(await layout(page), 'hors connexion');
    assert.equal(b.currentId, a.currentId);
    assert.deepEqual(b.ids, a.ids);
    assert.ok(b.text.includes(a.currentName));
    assert.ok(b.syncError, 'state.syncError renseigné');
  });

  test('nouvelle histoire publiée sur GitHub : elle apparaît après synchronisation', async () => {
    const a = await snapshot(page);
    await page.evaluate((added) => {
      window.__net.online = true;
      window.__net.remote = [...window.__net.remote, added];
      return window.__harness.runCommand();
    }, ADDED);
    await until(page, (n) => window.__harness.state.stories.length === n, a.total + 1);
    const b = await snapshot(page);
    assert.equal(b.counter[1], a.total + 1);
    assert.equal(b.currentId, a.currentId, 'l’histoire affichée ne bouge pas');
    assert.doesNotMatch(b.text, /\boffline\b/, 'indicateur retiré après succès');
    const tip = await page.evaluate(() => [...document.querySelectorAll('#widget [title]')].map((e) => e.getAttribute('title')).find((t) => /^Synced with GitHub at /.test(t)));
    assert.ok(tip, 'infobulle « Synced with GitHub at ... »');
    const call = await page.evaluate(() => window.__net.calls.filter((c) => c.url.includes('stories.json')).pop());
    assert.match(call.url, /[?&]t=/, 'URL anti-cache ?t=');
    assert.equal(call.options.cache, 'no-store');
    let found = false;
    for (let i = 0; i <= b.total && !found; i += 1) {
      found = (await snapshot(page)).text.includes(ADDED.name);
      if (!found) await click(page, 'next');
    }
    assert.ok(found, 'la nouvelle personne est accessible avec ›');
  });

  test('rechargement hors connexion : personne courante et pause restaurées, cache relu', async () => {
    await click(page, 'pause');
    const a = await snapshot(page);
    assert.equal(a.paused, true);
    const again = await openWidget(context, { online: false, remote: null });
    await until(again, (id) => window.__harness.state.currentId === id, a.currentId);
    const b = await snapshot(again);
    assert.equal(b.paused, true, 'pause mémorisée');
    assert.ok(Math.abs(b.width - CARD_W) <= 1 && Math.abs(b.height - CARD_H) <= 1, `taille fixe ${CARD_W} × ${CARD_H} : ${b.width} × ${b.height}`);
    assert.deepEqual(b.ids, a.ids, 'histoires de GitHub conservées hors connexion (cache)');
    assert.ok(b.text.includes(a.currentName));
    const stored = await again.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mur-des-retournements-settings')));
    assert.ok(stored.includes('mur-des-retournements-settings-v3'), `préférences v3 enregistrées : ${stored}`);
    assert.deepEqual(b.errors, []);
    await again.close();
  });

  test('section AT 25 et accroche : visibles si at25/headline présents, absentes sinon', async () => {
    const remote = local.map((x) => ({ ...x }));
    remote[0].at25 = 'At 25, harness test text for the dedicated section.';
    remote[0].headline = 'Harness test headline';
    delete remote[1].at25;
    delete remote[1].headline;
    const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await route(ctx, env.bundle);
    const p = await openWidget(ctx, { online: true, remote });
    await until(p, (t) => document.getElementById('widget').innerText.includes(t), remote[0].at25.slice(0, 20));
    const s1 = await snapshot(p);
    assert.match(s1.text, /AT 25/);
    assert.equal(s1.at25Visible, true, 'section [data-role="at25"] visible');
    assert.equal(s1.headline, remote[0].headline, 'accroche [data-role="headline"] affichée');
    assert.ok(s1.headlineOnPhoto, 'accroche sur la photo');
    await click(p, 'next');
    const s2 = await snapshot(p);
    assert.equal(s2.currentId, remote[1].id);
    assert.doesNotMatch(s2.text, /AT 25/, 'section absente sans at25');
    assert.deepEqual((await layout(p)).content.sections, ['low', 'high']);
    assertV3Layout(await layout(p), 'sans at25 ni accroche');
    assert.equal(s2.at25Visible, false);
    assert.equal(s2.headline, null, 'pas d’accroche sans headline');
    await ctx.close();
  });

  test('histoire distante très longue : la zone texte défile, la carte reste à 490 px', async () => {
    const long = 'He kept going through years of setbacks, debts and doubts, and never gave up on the plan. ';
    const remote = local.map((x) => ({ ...x }));
    remote[0] = { ...remote[0], lowest: long.repeat(12).trim(), comeback: long.repeat(10).trim(), at25: long.repeat(6).trim() };
    const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await route(ctx, env.bundle);
    const p = await openWidget(ctx, { online: true, remote });
    await until(p, (t) => document.getElementById('widget').innerText.includes(t), remote[0].at25.slice(0, 40));
    const g = await layout(p);
    assertV3Layout(g, 'histoire longue');
    assert.ok(g.content.scrollHeight > g.content.clientHeight + 100, `texte plus long que la zone : ${g.content.scrollHeight} / ${g.content.clientHeight}`);
    await p.evaluate(() => { document.querySelector('#widget [data-role="content"]').scrollTop = 50; });
    assert.equal((await layout(p)).content.scrollTop, 50);
    const navBefore = (await layout(p)).nav;
    await click(p, 'next');
    await click(p, 'prev');
    const after = await layout(p);
    assert.equal(after.content.scrollTop, 0, 'remontée en haut après › puis ‹');
    assert.deepEqual(after.nav, navBefore, 'nav immobile');
    assert.ok(Math.abs(after.card.height - CARD_H) <= 1, 'la carte ne grandit pas');
    await ctx.close();
  });

  test('fenêtre étroite (360 px) : largeur réduite, hauteur 490, carte entièrement visible', async () => {
    const ctx = await env.browser.newContext({ viewport: { width: 360, height: 900 } });
    await route(ctx, env.bundle);
    const p = await openWidget(ctx, { online: false });
    const s = await snapshot(p);
    assert.ok(s.width <= 360 && s.width < CARD_W, `largeur réduite : ${s.width}`);
    assert.ok(Math.abs(s.height - CARD_H) <= 1, `hauteur toujours ${CARD_H} : ${s.height}`);
    assertV3Layout(await layout(p), 'fenêtre étroite', s.width);
    assert.ok(s.width >= 240, `largeur encore lisible : ${s.width}`);
    assert.ok(s.left >= 0 && s.right <= s.viewport, `carte dans la fenêtre : ${s.left}..${s.right} / ${s.viewport}`);
    const scroll = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert.ok(scroll, 'aucun défilement horizontal');
    assertV3Card(s, null);
    await ctx.close();
  });

  test('ancien cache v1 à 20 personnes + réseau coupé : seules les 9 cartes embarquées', async () => {
    const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await route(ctx, env.bundle);
    await seedStorage(ctx, {
      [CACHE_V1]: oldCacheV1(local),
      [PREFS_V2]: JSON.stringify({ currentId: 'jobs', size: 2, paused: false }),
    });
    const p = await openWidget(ctx, { online: false });
    await p.waitForTimeout(100);
    const s = await snapshot(p);
    assert.deepEqual(s.ids, WHITELIST, 'les personnes du cache v1 ne reviennent pas');
    assert.equal(s.currentId, WHITELIST[0], 'préférence v2 sur une personne retirée : première carte');
    assert.deepEqual(s.counter, [1, 9]);
    for (let i = 0; i < 9; i += 1) {
      const t = (await snapshot(p)).text;
      for (const id of RETIRED) assert.ok(!t.includes(`Retired ${id}`), `${id} ne doit pas s’afficher`);
      await click(p, 'next');
    }
    await ctx.close();
  });

  test('distant à 9 : aucune personne retirée ne revient après synchronisation ni rechargement', async () => {
    const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await route(ctx, env.bundle);
    await seedStorage(ctx, { [CACHE_V1]: oldCacheV1(local) });
    const p = await openWidget(ctx, { online: true, remote: local });
    await until(p, () => !!window.__harness.state.lastSync);
    const s = await snapshot(p);
    assert.deepEqual(s.ids, WHITELIST);
    assert.equal(s.syncError, null);
    await p.close();
    const again = await openWidget(ctx, { online: false });
    await again.waitForTimeout(100);
    const r = await snapshot(again);
    assert.deepEqual(r.ids, WHITELIST, 'après rechargement hors connexion');
    assert.deepEqual(r.counter, [1, 9]);
    assert.ok(!RETIRED.some((id) => r.ids.includes(id)));
    await ctx.close();
  });
});

after(async () => { await env.browser?.close(); });

// ---------------------------------------------------------------------------
// Aperçu navigateur (preview/index.html) : même interface que le widget
// ---------------------------------------------------------------------------
describe('aperçu navigateur (preview/index.html, Chromium)', { skip }, () => {
  let context;
  let local;
  const PREVIEW = `${ORIGIN}/repo/preview/index.html`;
  const openPreview = async (ctx) => {
    const p = await ctx.newPage();
    await p.goto(PREVIEW);
    await p.waitForFunction(() => /\d+\s*\/\s*9\b/.test(document.body.innerText), null, { timeout: 5000 });
    return p;
  };

  before(async () => {
    local = JSON.parse(read(path.join(ROOT, 'stories.json')));
    context = await env.browser.newContext({ viewport: { width: 1280, height: 1200 } });
    await route(context, env.bundle);
  });
  after(async () => { await context?.close(); });

  test('charge les 9 histoires de ../stories.json, interface v2, photos locales', async () => {
    const p = await openPreview(context);
    for (let i = 0; i < 9; i += 1) {
      await waitImage(p, '#card');
      const s = await snapshot(p, '#card');
      assert.deepEqual(s.counter, [i + 1, 9]);
      const story = local[i];
      assertV3Card(s, story);
      assert.ok(s.imageSrc.startsWith(`${ORIGIN}/repo/widget/mur-des-retournements.widget/photos/`), `photo locale : ${s.imageSrc}`);
      assert.ok(Math.abs(s.width - 420) <= 2, `largeur 420, mesurée ${s.width}`);
      await click(p, 'next', '#card');
    }
    const page = await p.evaluate(() => document.body.innerText);
    assert.doesNotMatch(page, /mur des retournements/i);
    await p.close();
  });

  test('fenêtre étroite : largeur réduite, sans défilement horizontal', async () => {
    const ctx = await env.browser.newContext({ viewport: { width: 360, height: 900 } });
    await route(ctx, env.bundle);
    const p = await openPreview(ctx);
    const s = await snapshot(p, '#card');
    assert.ok(s.width < 420 && s.left >= 0 && s.right <= s.viewport, `${s.left}..${s.right} / ${s.viewport}`);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await ctx.close();
  });
});
