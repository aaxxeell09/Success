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
    assert.doesNotMatch(jsx, /Taille\s/, 'libellé « Taille » encore présent');
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

// Contrat v2 : liste blanche stricte, dans cet ordre.
const WHITELIST = ['valdas', 'elon', 'mandela', 'trump', 'chesky', 'collison', 'pope', 'jose', 'thatcher'];
// Les 11 personnes retirées (ancienne liste à 20) : ne doivent plus jamais revenir.
const RETIRED = ['kariko', 'rdj', 'dej', 'jensen', 'dyson', 'melanie', 'jobs', 'tina', 'knight', 'jan', 'niel'];
const CACHE_V1 = 'mur-des-retournements-stories-cache-v1';
const PREFS_V2 = 'mur-des-retournements-settings-v2';
const retiredStory = (id) => ({ id, name: `Retiré ${id}`, lowest: `Épreuve retirée ${id}.`, comeback: `Retournement retiré ${id}.` });
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
  const rect = card ? card.getBoundingClientRect() : { width: 0, left: 0, right: 0 };
  const at25 = root.querySelector('[data-role="at25"]');
  const hl = root.querySelector('[data-role="headline"]');
  const hlVisible = !!hl && hl.offsetParent !== null && !hl.hidden && getComputedStyle(hl).display !== 'none' && hl.textContent.trim() !== '';
  const photoBox = (() => { const im = root.querySelector('img'); return im ? im.parentElement : null; })();
  const buttons = [...root.querySelectorAll('button, [role="button"]')].filter((b) => !b.hidden && getComputedStyle(b).display !== 'none');
  return {
    text,
    width: Math.round(rect.width),
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

const BUTTONS = {
  prev: (t, l) => t === '‹' || t === '<' || t === '←' || /pr[ée]c[ée]dent/i.test(l),
  next: (t, l) => t === '›' || t === '>' || t === '→' || /suivant/i.test(l),
  pause: (t, l) => /pause|reprendre|lecture|rotation/i.test(l) || ['Ⅱ', '▶', '⏸', '❚❚', '||', '▶︎', '⏵', '⏯'].includes(t),
};

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

// Interface v2 : 3 boutons, aucun S/M/L, aucun titre, aucun crédit ni citation.
function assertV2Card(s, story) {
  assert.doesNotMatch(s.text, /le mur des retournements/i, 'le titre du widget ne doit pas être affiché');
  assert.doesNotMatch(s.text, /Photo\s*:/, 'aucun crédit « Photo : » affiché');
  assert.equal(s.buttons.length, 3, `exactement 3 boutons, trouvés : ${JSON.stringify(s.buttons)}`);
  for (const k of ['S', 'M', 'L']) {
    assert.ok(!s.buttons.some((b) => b.text === k || new RegExp(`\\(${k}\\)|taille`, 'i').test(b.label)), `aucun bouton ${k}`);
  }
  const kinds = s.buttons.map((b) => Object.keys(BUTTONS).find((k) => BUTTONS[k](b.text, b.label)));
  assert.deepEqual([...kinds].sort(), ['next', 'pause', 'prev'], `boutons attendus : précédent, suivant, pause ; reçus ${JSON.stringify(s.buttons)}`);
  assert.match(s.text, /au plus bas/i);
  assert.match(s.text, /le retournement/i);
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
      assert.match(s.text, /À 25 ANS/i, `section « À 25 ANS » attendue pour ${story.id}`);
      assert.ok(s.text.includes(story.at25.slice(0, 30)), 'texte at25 affiché');
    } else {
      assert.doesNotMatch(s.text, /À 25 ANS/i, `section « À 25 ANS » absente pour ${story.id}`);
      assert.equal(s.at25Visible, false);
    }
  }
}

describe('rendu réel du widget (Chromium)', { skip }, () => {
  let context;
  let page;
  let local;
  const byId = (id) => local.find((x) => x.id === id);
  const ADDED = { id: 'ajout-harnais', name: 'Personne Ajoutée Harnais', lowest: 'Épreuve ajoutée sur GitHub.', comeback: 'Retournement ajouté sur GitHub.' };

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

  test('carte initiale : sans titre ni crédit, 3 boutons, compteur 1 / 9 sur la photo, largeur 420', async () => {
    const s = await snapshot(page);
    assert.deepEqual(s.errors, []);
    assert.equal(s.currentId, WHITELIST[0]);
    assertV2Card(s, byId(s.currentId));
    assert.deepEqual(s.counter, [1, 9]);
    assert.match(s.text, /1 \/ 9/);
    const counterOnPhoto = await page.evaluate(() => {
      const card = document.querySelector('#widget article');
      const img = card && card.querySelector('img');
      const photo = img ? img.parentElement : card && card.firstElementChild;
      return !!photo && [...photo.querySelectorAll('span, div')].some((el) => /^\s*\d+\s*\/\s*\d+\s*$/.test(el.textContent));
    });
    assert.ok(counterOnPhoto, 'compteur de navigation superposé à la photo');
    assert.ok(Math.abs(s.width - 420) <= 2, `largeur ≈ 420 px, mesurée ${s.width}`);
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
      assertV2Card(s, story);
      assert.ok(s.loadedImage && s.imageWidth > 1, `photo chargée pour ${story.id} (naturalWidth ${s.imageWidth})`);
      assert.ok(s.imageSrc.startsWith(`${ORIGIN}/mur-des-retournements.widget/photos/`), `photo servie localement : ${s.imageSrc}`);
      await click(page, 'next');
    }
    const back = await snapshot(page);
    assert.equal(back.currentId, WHITELIST[0], 'retour circulaire à la première carte');
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
    await click(page, 'pause');
    assert.notEqual(await signature(await button(page, 'pause')), before, 'l’icône de pause doit changer');
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
    await until(page, () => /hors connexion|hors ligne/i.test(document.getElementById('widget').innerText));
    const b = await snapshot(page);
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
    assert.doesNotMatch(b.text, /hors connexion|hors ligne/i, 'indicateur retiré après succès');
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
    assert.ok(Math.abs(b.width - 420) <= 2, 'largeur fixe 420 px');
    assert.deepEqual(b.ids, a.ids, 'histoires de GitHub conservées hors connexion (cache)');
    assert.ok(b.text.includes(a.currentName));
    const stored = await again.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mur-des-retournements-settings')));
    assert.ok(stored.includes('mur-des-retournements-settings-v3'), `préférences v3 enregistrées : ${stored}`);
    assert.deepEqual(b.errors, []);
    await again.close();
  });

  test('section À 25 ANS et accroche : visibles si at25/headline présents, absentes sinon', async () => {
    const remote = local.map((x) => ({ ...x }));
    remote[0].at25 = 'À 25 ans, texte de test du harnais pour la section dédiée.';
    remote[0].headline = 'Accroche de test du harnais';
    delete remote[1].at25;
    delete remote[1].headline;
    const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 1400 } });
    await route(ctx, env.bundle);
    const p = await openWidget(ctx, { online: true, remote });
    await until(p, (t) => document.getElementById('widget').innerText.includes(t), remote[0].at25.slice(0, 20));
    const s1 = await snapshot(p);
    assert.match(s1.text, /À 25 ANS/i);
    assert.equal(s1.at25Visible, true, 'section [data-role="at25"] visible');
    assert.equal(s1.headline, remote[0].headline, 'accroche [data-role="headline"] affichée');
    assert.ok(s1.headlineOnPhoto, 'accroche sur la photo');
    await click(p, 'next');
    const s2 = await snapshot(p);
    assert.equal(s2.currentId, remote[1].id);
    assert.doesNotMatch(s2.text, /À 25 ANS/i, 'section absente sans at25');
    assert.equal(s2.at25Visible, false);
    assert.equal(s2.headline, null, 'pas d’accroche sans headline');
    await ctx.close();
  });

  test('fenêtre étroite (360 px) : largeur réduite, carte entièrement visible', async () => {
    const ctx = await env.browser.newContext({ viewport: { width: 360, height: 900 } });
    await route(ctx, env.bundle);
    const p = await openWidget(ctx, { online: false });
    const s = await snapshot(p);
    assert.ok(s.width <= 360 && s.width < 420, `largeur réduite : ${s.width}`);
    assert.ok(s.width >= 240, `largeur encore lisible : ${s.width}`);
    assert.ok(s.left >= 0 && s.right <= s.viewport, `carte dans la fenêtre : ${s.left}..${s.right} / ${s.viewport}`);
    const scroll = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert.ok(scroll, 'aucun défilement horizontal');
    assertV2Card(s, null);
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
      for (const id of RETIRED) assert.ok(!t.includes(`Retiré ${id}`), `${id} ne doit pas s’afficher`);
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
      assertV2Card(s, story);
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
