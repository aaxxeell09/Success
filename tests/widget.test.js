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

async function openWidget(context, { online = true, remote = null, clock = false } = {}) {
  const page = await context.newPage();
  page.on('pageerror', (e) => { page.__errors = [...(page.__errors || []), String(e)]; });
  await page.addInitScript(([o, r]) => { window.__NET_INIT = { online: o, remote: r }; }, [online, remote]);
  if (clock) await page.clock.install({ time: new Date('2026-01-05T09:00:00Z') });
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => window.__harness && window.__harness.ready && window.__harness.renders > 0);
  return page;
}

async function route(context, bundle) {
  await context.route('**/*', async (r) => {
    const url = new URL(r.request().url());
    if (url.origin === ORIGIN) {
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (rel === 'bundle.js') return r.fulfill({ status: 200, contentType: TYPES['.js'], body: bundle });
      let file = null;
      if (rel.startsWith('mur-des-retournements.widget/')) file = path.join(WIDGET_DIR, rel.slice('mur-des-retournements.widget/'.length));
      else if (['index.html', 'mock-network.js'].includes(rel)) file = path.join(HARNESS_DIR, rel);
      if (file && file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile()) {
        return r.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: readFileSync(file) });
      }
      return r.fulfill({ status: 404, body: 'introuvable' });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return r.abort();
  });
}

// Lecture de l'interface : textes, compteur, boutons, largeur, image.
const snapshot = (page) => page.evaluate(() => {
  const root = document.getElementById('widget');
  const card = root.firstElementChild;
  const text = root.innerText || '';
  const counter = text.match(/(\d+)\s*\/\s*(\d+)/);
  const s = window.__harness.state;
  const current = (s.stories || []).find((x) => x.id === s.currentId) || null;
  const imgs = [...root.querySelectorAll('img')].filter((i) => getComputedStyle(i).display !== 'none' && i.getAttribute('src'));
  return {
    text,
    width: card ? Math.round(card.getBoundingClientRect().width) : 0,
    counter: counter ? [Number(counter[1]), Number(counter[2])] : null,
    currentId: s.currentId,
    currentName: current && current.name,
    paused: s.paused,
    size: s.size,
    total: (s.stories || []).length,
    syncError: s.syncError,
    loadedImage: imgs.some((i) => i.complete && i.naturalWidth > 0),
    hasPhotoSource: !!(current && (current.photo || current.image_url || current.wikipedia)),
    errors: window.__harness.errors,
  };
});

const BUTTONS = {
  prev: (b, t, l) => t === '‹' || t === '<' || t === '←' || /pr[ée]c[ée]dent/i.test(l),
  next: (b, t, l) => t === '›' || t === '>' || t === '→' || /suivant/i.test(l),
  pause: (b, t, l) => /pause|reprendre|lecture|rotation/i.test(l) || ['Ⅱ', '▶', '⏸', '❚❚', '||', '▶︎', '⏵', '⏯'].includes(t),
  S: (b, t) => t === 'S', M: (b, t) => t === 'M', L: (b, t) => t === 'L',
};

async function button(page, kind) {
  const handles = await page.$$('#widget button, #widget [role="button"]');
  for (const h of handles) {
    const [t, l] = await h.evaluate((el) => [el.textContent.trim(), `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`]);
    if (BUTTONS[kind](h, t, l)) return h;
  }
  throw new Error(`bouton introuvable : ${kind}`);
}
const signature = (h) => h.evaluate((el) => `${el.textContent.trim()}|${el.getAttribute('aria-label')}|${el.getAttribute('title')}|${el.innerHTML}`);
const click = async (page, kind) => { await (await button(page, kind)).click(); await page.waitForTimeout(30); };
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 });

describe('rendu réel du widget (Chromium)', { skip }, () => {
  let context;
  let page;
  let local;
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
    await env.browser?.close();
  });

  test('affiche nom, photo et sections', async () => {
    const s = await snapshot(page);
    assert.deepEqual(s.errors, []);
    assert.ok(s.currentName, 'histoire courante définie');
    assert.ok(s.text.includes(s.currentName), `nom « ${s.currentName} » affiché`);
    assert.match(s.text, /au plus bas/i);
    assert.match(s.text, /retournement/i);
    const story = local.find((x) => x.id === s.currentId);
    assert.ok(s.text.includes(story.lowest.slice(0, 30)), 'récit « au plus bas » affiché');
    assert.ok(s.text.includes(story.comeback.slice(0, 30)), 'récit du retournement affiché');
    assert.deepEqual(s.counter, [1, s.total]);
    if (s.hasPhotoSource) {
      await until(page, () => [...document.querySelectorAll('#widget img')].some((i) => i.complete && i.naturalWidth > 0));
    }
  });

  test('‹ et › changent de personne', async () => {
    const a = await snapshot(page);
    await click(page, 'next');
    const b = await snapshot(page);
    assert.notEqual(b.currentId, a.currentId);
    assert.ok(b.text.includes(b.currentName));
    assert.deepEqual(b.counter, [2, a.total]);
    await click(page, 'prev');
    const c = await snapshot(page);
    assert.equal(c.currentId, a.currentId);
    await click(page, 'prev');
    const d = await snapshot(page);
    assert.deepEqual(d.counter, [a.total, a.total], 'navigation circulaire vers la dernière');
    await click(page, 'next');
  });

  test('S, M, L changent la largeur', async () => {
    const widths = {};
    for (const k of ['S', 'M', 'L']) {
      await click(page, k);
      widths[k] = (await snapshot(page)).width;
    }
    assert.ok(widths.S < widths.M && widths.M < widths.L, `largeurs croissantes : ${JSON.stringify(widths)}`);
    for (const [k, w] of Object.entries({ S: 320, M: 420, L: 540 })) {
      assert.ok(Math.abs(widths[k] - w) <= 30, `largeur ${k} ≈ ${w}px, mesurée ${widths[k]}px`);
    }
  });

  test('pause change l’icône et bloque la rotation de 20 minutes', async () => {
    const before = await signature(await button(page, 'pause'));
    const start = await snapshot(page);
    await click(page, 'pause');
    const pausedSig = await signature(await button(page, 'pause'));
    assert.notEqual(pausedSig, before, 'l’icône de pause doit changer');
    assert.equal((await snapshot(page)).paused, true);
    await page.clock.fastForward('21:00');
    await page.waitForTimeout(50);
    assert.equal((await snapshot(page)).currentId, start.currentId, 'pas de rotation en pause');
    await click(page, 'pause');
    assert.equal(await signature(await button(page, 'pause')), before);
    await page.clock.fastForward('21:00');
    await until(page, (id) => window.__harness.state.currentId !== id, start.currentId);
  });

  test('hors connexion : indicateur affiché, données conservées', async () => {
    const a = await snapshot(page);
    await page.evaluate(() => { window.__net.online = false; return window.__harness.runCommand(); });
    await until(page, () => /hors connexion|hors ligne/i.test(document.getElementById('widget').innerText));
    const b = await snapshot(page);
    assert.equal(b.currentId, a.currentId);
    assert.equal(b.total, a.total);
    assert.ok(b.text.includes(a.currentName));
    assert.ok(b.syncError, 'state.syncError renseigné');
  });

  test('nouvelle histoire publiée sur GitHub : compteur augmenté', async () => {
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

  test('rechargement hors connexion : préférences et cache restaurés', async () => {
    const a = await snapshot(page);
    const again = await openWidget(context, { online: false, remote: null });
    await until(again, (id) => window.__harness.state.currentId === id, a.currentId);
    const b = await snapshot(again);
    assert.equal(b.size, a.size);
    assert.ok(Math.abs(b.width - a.width) <= 2, 'taille mémorisée');
    assert.equal(b.total, a.total, 'histoires de GitHub conservées hors connexion (cache)');
    assert.ok(b.text.includes(a.currentName));
    await again.close();
  });
});
