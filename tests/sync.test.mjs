// Tests du module de synchronisation : node --test tests/sync.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  DATA_URL,
  SYNC_INTERVAL_MS,
  CACHE_KEY,
  MAX_TEXT_LENGTH,
  validateStories,
  readCache,
  writeCache,
  fetchRemoteStories,
  createSyncer,
} from '../widget/mur-des-retournements.widget/lib/sync.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const story = (id, extra = {}) => ({ id, name: 'Nom ' + id, lowest: 'Bas ' + id, comeback: 'Haut ' + id, ...extra });

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

function jsonResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const noRetry = { retryDelaysMs: [] };

describe('constantes', () => {
  test('valeurs du contrat', () => {
    assert.equal(DATA_URL, 'https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json');
    assert.equal(SYNC_INTERVAL_MS, 300000);
    assert.equal(CACHE_KEY, 'mur-des-retournements-stories-cache-v1');
  });
});

describe('validateStories', () => {
  test('rejette tout ce qui n\'est pas un tableau', () => {
    for (const bad of [null, undefined, {}, 'x', 42, { stories: [] }]) {
      const r = validateStories(bad);
      assert.deepEqual(r.stories, []);
      assert.equal(r.rejected.length, 1);
      assert.equal(r.rejected[0].index, -1);
    }
  });

  test('tableau vide : aucune histoire, aucun rejet', () => {
    assert.deepEqual(validateStories([]), { stories: [], rejected: [], warnings: [] });
  });

  test('histoire minimale valide et histoire complète conservées', () => {
    const full = story('nelson-mandela', {
      category: 'Politique · Afrique du Sud', lesson: 'Une leçon.', wikipedia: 'Nelson Mandela',
      photo: 'photos/nelson-mandela.jpg', image_url: 'https://upload.wikimedia.org/a.jpg',
      image_credit: 'Auteur, CC BY 4.0', image_license: 'CC BY 4.0',
      image_source: 'https://commons.wikimedia.org/wiki/File:A.jpg', sources: ['https://fr.wikipedia.org/wiki/Nelson_Mandela'],
    });
    const r = validateStories([story('a1'), full]);
    assert.equal(r.rejected.length, 0);
    assert.equal(r.warnings.length, 0);
    assert.deepEqual(r.stories[0], story('a1'));
    assert.deepEqual(r.stories[1], full);
  });

  test('chaque entrée invalide est rejetée seule, avec index, id et raison', () => {
    const data = [
      story('ok-1'),
      'texte',
      null,
      [1, 2],
      { name: 'Sans id', lowest: 'a', comeback: 'b' },
      story('   '),
      story('Majuscule'),
      story('accent-é'),
      story('avec espace'),
      story('ok-1'),
      { id: 'sans-nom', lowest: 'a', comeback: 'b' },
      story('nom-vide', { name: '   ' }),
      story('lowest-nombre', { lowest: 12 }),
      story('comeback-absent', { comeback: undefined }),
      story('ok-2'),
    ];
    const r = validateStories(data);
    assert.deepEqual(r.stories.map((s) => s.id), ['ok-1', 'ok-2']);
    assert.equal(r.rejected.length, 13);
    assert.deepEqual(r.rejected.map((x) => x.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (const x of r.rejected) {
      assert.equal(typeof x.reason, 'string');
      assert.ok(x.reason.length > 0);
      assert.ok('id' in x);
    }
    assert.match(r.rejected[0].reason, /objet/);
    assert.match(r.rejected[3].reason, /id/);
    assert.equal(r.rejected[5].id, 'Majuscule');
    assert.match(r.rejected[5].reason, /non conforme/);
    assert.equal(r.rejected[8].id, 'ok-1');
    assert.match(r.rejected[8].reason, /déjà utilisé/);
    assert.match(r.rejected[9].reason, /name/);
    assert.match(r.rejected[10].reason, /name/);
    assert.match(r.rejected[11].reason, /lowest/);
    assert.match(r.rejected[12].reason, /comeback/);
  });

  test('id non textuel rejeté', () => {
    const r = validateStories([story(12), story(true)]);
    assert.equal(r.stories.length, 0);
    assert.equal(r.rejected.length, 2);
  });

  test('doublon détecté après trim de l\'id ; la première occurrence gagne', () => {
    const r = validateStories([story('dup', { name: 'Premier' }), story('  dup ', { name: 'Second' })]);
    assert.equal(r.stories.length, 1);
    assert.equal(r.stories[0].name, 'Premier');
    assert.equal(r.rejected[0].index, 1);
  });

  test('les chaînes sont nettoyées (trim)', () => {
    const r = validateStories([{ id: '  abc ', name: '  Nom ', lowest: '\n bas \t', comeback: ' haut ', lesson: '  leçon  ', category: '   ' }]);
    assert.deepEqual(r.stories[0], { id: 'abc', name: 'Nom', lowest: 'bas', comeback: 'haut', lesson: 'leçon' });
  });

  test('champs optionnels de mauvais type retirés, histoire conservée', () => {
    const r = validateStories([story('x', {
      category: 5, lesson: ['a'], wikipedia: { t: 1 }, image_credit: true, image_license: 3,
      photo: 7, image_url: 12, image_source: {}, sources: 'https://a.org',
    })]);
    assert.equal(r.rejected.length, 0);
    assert.deepEqual(r.stories[0], story('x'));
    assert.equal(r.warnings.length, 9);
    assert.ok(r.warnings.every((w) => w.id === 'x' && w.index === 0 && typeof w.field === 'string'));
  });

  test('null et undefined dans les optionnels sont ignorés sans avertissement', () => {
    const r = validateStories([story('x', { lesson: null, photo: undefined, sources: null })]);
    assert.deepEqual(r.stories[0], story('x'));
    assert.equal(r.warnings.length, 0);
  });

  test('image_url et image_source non https retirées', () => {
    for (const bad of ['http://exemple.org/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//cdn.org/a.jpg', 'https://', 'https://a b.org/x', 'ftp://a.org/x']) {
      const r = validateStories([story('x', { image_url: bad, image_source: bad })]);
      assert.equal(r.stories[0].image_url, undefined, bad);
      assert.equal(r.stories[0].image_source, undefined, bad);
      assert.equal(r.warnings.length, 2);
    }
    const ok = validateStories([story('x', { image_url: '  https://upload.wikimedia.org/a.jpg ' })]);
    assert.equal(ok.stories[0].image_url, 'https://upload.wikimedia.org/a.jpg');
  });

  test('photo : seul un chemin relatif sûr est conservé', () => {
    assert.equal(validateStories([story('x', { photo: 'photos/x.jpg' })]).stories[0].photo, 'photos/x.jpg');
    for (const bad of ['/etc/passwd', '../secret.jpg', 'photos/../../a.jpg', 'https://a.org/x.jpg', 'photos//x.jpg', 'photos/x y.jpg', './x.jpg']) {
      const r = validateStories([story('x', { photo: bad })]);
      assert.equal(r.stories[0].photo, undefined, bad);
      assert.equal(r.warnings.length, 1, bad);
    }
  });

  test('sources : adresses invalides et doublons filtrés', () => {
    const r = validateStories([story('x', { sources: ['https://a.org', 'http://b.org/p', 3, 'pas une url', 'https://a.org', ' https://c.org '] })]);
    assert.deepEqual(r.stories[0].sources, ['https://a.org', 'http://b.org/p', 'https://c.org']);
    assert.equal(r.warnings.length, 1);
    const empty = validateStories([story('y', { sources: [1, 2] })]);
    assert.equal(empty.stories[0].sources, undefined);
  });

  test('champs inconnus ignorés', () => {
    const r = validateStories([story('x', { inconnu: 'valeur', __proto__x: 1 })]);
    assert.deepEqual(Object.keys(r.stories[0]).sort(), ['comeback', 'id', 'lowest', 'name']);
  });

  test('textes démesurés tronqués à MAX_TEXT_LENGTH (pas rejetés)', () => {
    const long = 'a'.repeat(5000);
    const r = validateStories([story('x', { lowest: long, lesson: long })]);
    assert.equal(r.rejected.length, 0);
    assert.equal(Array.from(r.stories[0].lowest).length, MAX_TEXT_LENGTH);
    assert.ok(r.stories[0].lowest.endsWith('…'));
    assert.equal(Array.from(r.stories[0].lesson).length, MAX_TEXT_LENGTH);
    assert.equal(r.warnings.filter((w) => /tronqué/.test(w.reason)).length, 2);
    const exact = validateStories([story('y', { lowest: 'b'.repeat(MAX_TEXT_LENGTH) })]);
    assert.equal(exact.stories[0].lowest.length, MAX_TEXT_LENGTH);
    assert.equal(exact.warnings.length, 0);
  });

  test('troncature sans couper un emoji', () => {
    const r = validateStories([story('x', { comeback: '😀'.repeat(3000) })]);
    const chars = Array.from(r.stories[0].comeback);
    assert.equal(chars.length, MAX_TEXT_LENGTH);
    assert.ok(chars.slice(0, -1).every((c) => c === '😀'));
  });

  test('id trop long rejeté, URL trop longue retirée', () => {
    assert.equal(validateStories([story('a'.repeat(101))]).rejected.length, 1);
    assert.equal(validateStories([story('a'.repeat(100))]).stories.length, 1);
    const r = validateStories([story('x', { image_url: 'https://a.org/' + 'b'.repeat(3000) })]);
    assert.equal(r.stories[0].image_url, undefined);
  });

  test('ne modifie pas les données d\'entrée', () => {
    const input = [story(' x ', { lesson: 5 })];
    const copy = JSON.parse(JSON.stringify(input));
    validateStories(input);
    assert.deepEqual(input, copy);
  });

  test('le stories.json actuel du dépôt passe sans rejet ni avertissement', () => {
    for (const file of ['stories.json', 'widget/mur-des-retournements.widget/stories.json']) {
      const data = JSON.parse(readFileSync(join(root, file), 'utf8'));
      const r = validateStories(data);
      assert.deepEqual(r.rejected, [], file);
      assert.deepEqual(r.warnings, [], file);
      assert.equal(r.stories.length, data.length, file);
      for (let i = 0; i < data.length; i += 1) {
        for (const [k, v] of Object.entries(r.stories[i])) assert.deepEqual(v, data[i][k]);
      }
    }
  });
});

describe('cache', () => {
  test('écriture puis lecture', () => {
    const storage = memoryStorage();
    assert.equal(writeCache(storage, [story('a')], 1234), true);
    assert.deepEqual(readCache(storage), { stories: [story('a')], savedAt: 1234 });
    assert.equal(JSON.parse(storage.data[CACHE_KEY]).version, 1);
  });

  test('now peut être une fonction', () => {
    const storage = memoryStorage();
    writeCache(storage, [story('a')], () => 99);
    assert.equal(readCache(storage).savedAt, 99);
  });

  test('cache absent ou stockage absent : null, sans lever', () => {
    assert.equal(readCache(memoryStorage()), null);
    assert.equal(readCache(null), null);
    assert.equal(readCache({}), null);
    assert.equal(writeCache(null, [story('a')], 1), false);
    assert.equal(writeCache({}, [story('a')], 1), false);
  });

  test('cache corrompu : null', () => {
    for (const raw of ['{pas du json', '"texte"', '[]', 'null', '42', JSON.stringify({ stories: 'x' }), JSON.stringify({ stories: [] }), JSON.stringify({ stories: [{ id: 'A' }] })]) {
      assert.equal(readCache(memoryStorage({ [CACHE_KEY]: raw })), null, raw);
    }
  });

  test('cache partiellement invalide : seules les histoires valides sont relues', () => {
    const storage = memoryStorage({ [CACHE_KEY]: JSON.stringify({ savedAt: 'hier', stories: [story('a'), { id: 'b' }] }) });
    assert.deepEqual(readCache(storage), { stories: [story('a')], savedAt: null });
  });

  test('getItem qui lève (accès refusé) : null', () => {
    assert.equal(readCache({ getItem() { throw new Error('SecurityError'); } }), null);
  });

  test('quota dépassé : writeCache ne lève pas et retourne false', () => {
    const storage = { getItem: () => null, setItem() { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } };
    assert.equal(writeCache(storage, [story('a')], 1), false);
  });

  test('liste vide ou non tableau : rien n\'est écrit', () => {
    const storage = memoryStorage();
    assert.equal(writeCache(storage, [], 1), false);
    assert.equal(writeCache(storage, 'x', 1), false);
    assert.equal(CACHE_KEY in storage.data, false);
  });
});

describe('fetchRemoteStories', () => {
  test('succès : URL anti-cache, cache no-store, signal, histoires validées', async () => {
    const f = fakeFetch(() => jsonResponse([story('a'), { id: 'MAUVAIS' }]));
    const stories = await fetchRemoteStories({ fetchImpl: f, now: () => 777 });
    assert.deepEqual(stories, [story('a')]);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, DATA_URL + '?t=777');
    assert.equal(f.calls[0].init.cache, 'no-store');
    assert.ok(f.calls[0].init.signal);
  });

  test('URL contenant déjà un paramètre : ajout avec &', async () => {
    const f = fakeFetch(() => jsonResponse([story('a')]));
    await fetchRemoteStories({ fetchImpl: f, url: 'https://exemple.org/s.json?ref=main', now: () => 5 });
    assert.equal(f.calls[0].url, 'https://exemple.org/s.json?ref=main&t=5');
  });

  test('réponse sans text() : repli sur json()', async () => {
    const f = fakeFetch(() => ({ ok: true, status: 200, json: async () => [story('a')] }));
    assert.deepEqual(await fetchRemoteStories({ fetchImpl: f }), [story('a')]);
  });

  for (const status of [404, 500, 403, 503]) {
    test('HTTP ' + status + ' : erreur HTTP', async () => {
      const f = fakeFetch(() => jsonResponse('Not Found', status));
      await assert.rejects(fetchRemoteStories({ fetchImpl: f }), (err) => err.code === 'HTTP' && err.status === status && err.message.includes(String(status)));
    });
  }

  test('réseau coupé : erreur NETWORK', async () => {
    const f = fakeFetch(() => { throw new TypeError('fetch failed'); });
    await assert.rejects(fetchRemoteStories({ fetchImpl: f }), (err) => err.code === 'NETWORK' && /fetch failed/.test(err.message));
  });

  test('JSON invalide : erreur JSON', async () => {
    const f = fakeFetch(() => jsonResponse('[{"id": "a",}]'));
    await assert.rejects(fetchRemoteStories({ fetchImpl: f }), (err) => err.code === 'JSON');
  });

  test('aucune histoire valide : erreur EMPTY', async () => {
    for (const body of [[], [{ id: 'x' }], { stories: [] }]) {
      const f = fakeFetch(() => jsonResponse(body));
      await assert.rejects(fetchRemoteStories({ fetchImpl: f }), (err) => err.code === 'EMPTY');
    }
  });

  test('fetch absent : erreur NO_FETCH', async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = undefined;
    try {
      await assert.rejects(fetchRemoteStories({}), (err) => err.code === 'NO_FETCH');
    } finally {
      globalThis.fetch = saved;
    }
  });

  test('délai dépassé : TIMEOUT et requête annulée via AbortController', async () => {
    let signal;
    const f = (url, init) => { signal = init.signal; return new Promise(() => {}); };
    const start = Date.now();
    await assert.rejects(fetchRemoteStories({ fetchImpl: f, timeoutMs: 30 }), (err) => err.code === 'TIMEOUT');
    assert.ok(Date.now() - start < 2000);
    assert.equal(signal.aborted, true);
  });

  test('délai dépassé quand fetch rejette sur abort (comportement réel) : TIMEOUT', async () => {
    const f = (url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await assert.rejects(fetchRemoteStories({ fetchImpl: f, timeoutMs: 20 }), (err) => err.code === 'TIMEOUT');
  });

  test('délai dépassé pendant la lecture du corps : TIMEOUT', async () => {
    const f = async () => ({ ok: true, status: 200, text: () => new Promise(() => {}) });
    await assert.rejects(fetchRemoteStories({ fetchImpl: f, timeoutMs: 20 }), (err) => err.code === 'TIMEOUT');
  });

  test('repli Promise.race sans AbortController', async () => {
    const saved = globalThis.AbortController;
    globalThis.AbortController = undefined;
    try {
      let init;
      const f = (u, i) => { init = i; return new Promise(() => {}); };
      await assert.rejects(fetchRemoteStories({ fetchImpl: f, timeoutMs: 20 }), (err) => err.code === 'TIMEOUT');
      assert.equal(init.signal, undefined);
      const ok = fakeFetch(() => jsonResponse([story('a')]));
      assert.deepEqual(await fetchRemoteStories({ fetchImpl: ok }), [story('a')]);
    } finally {
      globalThis.AbortController = saved;
    }
  });

  test('la minuterie d\'expiration est nettoyée après succès', async () => {
    const cleared = [];
    const f = fakeFetch(() => jsonResponse([story('a')]));
    await fetchRemoteStories({ fetchImpl: f, setTimeoutImpl: () => 'T1', clearTimeoutImpl: (t) => cleared.push(t) });
    assert.deepEqual(cleared, ['T1']);
  });
});

describe('createSyncer', () => {
  test('loadCached : DATA source cache si cache valide, true', () => {
    const events = [];
    const storage = memoryStorage();
    writeCache(storage, [story('a')], 42);
    const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(() => jsonResponse([])), ...noRetry });
    assert.equal(s.loadCached(), true);
    assert.deepEqual(events, [{ type: 'DATA', stories: [story('a')], source: 'cache', at: 42 }]);
  });

  test('loadCached : false et aucun événement sans cache valide', () => {
    for (const storage of [memoryStorage(), memoryStorage({ [CACHE_KEY]: '{corrompu' }), null]) {
      const events = [];
      const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(() => jsonResponse([])), ...noRetry });
      assert.equal(s.loadCached(), false);
      assert.deepEqual(events, []);
    }
  });

  test('syncNow : DATA remote au premier succès, puis SYNC_OK si identique, DATA si changé', async () => {
    const events = [];
    let body = [story('a')];
    const storage = memoryStorage();
    let t = 1000;
    const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(() => jsonResponse(body)), now: () => t, ...noRetry });
    await s.syncNow();
    t = 2000;
    await s.syncNow();
    body = [story('a'), story('b')];
    t = 3000;
    await s.syncNow();
    assert.deepEqual(events, [
      { type: 'DATA', stories: [story('a')], source: 'remote', at: 1000 },
      { type: 'SYNC_OK', at: 2000 },
      { type: 'DATA', stories: [story('a'), story('b')], source: 'remote', at: 3000 },
    ]);
    assert.deepEqual(readCache(storage), { stories: [story('a'), story('b')], savedAt: 3000 });
  });

  test('cache identique au distant : SYNC_OK après loadCached', async () => {
    const events = [];
    const storage = memoryStorage();
    writeCache(storage, [story('a')], 1);
    const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(() => jsonResponse([story('a')])), now: () => 5, ...noRetry });
    s.loadCached();
    await s.syncNow();
    assert.deepEqual(events.map((e) => e.type), ['DATA', 'SYNC_OK']);
  });

  test('initialStories : pas de DATA si le distant égale la copie embarquée', async () => {
    const events = [];
    const s = createSyncer({ dispatch: (e) => events.push(e), storage: memoryStorage(), fetchImpl: fakeFetch(() => jsonResponse([story('a')])), initialStories: [story('a')], now: () => 5, ...noRetry });
    await s.syncNow();
    assert.deepEqual(events, [{ type: 'SYNC_OK', at: 5 }]);
  });

  test('l\'empreinte porte sur les histoires validées (entrée invalide ajoutée : SYNC_OK)', async () => {
    const events = [];
    let body = [story('a')];
    const s = createSyncer({ dispatch: (e) => events.push(e), storage: memoryStorage(), fetchImpl: fakeFetch(() => jsonResponse(body)), ...noRetry });
    await s.syncNow();
    body = [story('a'), { id: 'INVALIDE' }, { ...story('a'), name: '  Nom a  ' }];
    await s.syncNow();
    assert.deepEqual(events.map((e) => e.type), ['DATA', 'SYNC_OK']);
  });

  test('requêtes concurrentes : une seule requête, même promesse', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const f = fakeFetch(async () => { await gate; return jsonResponse([story('a')]); });
    const events = [];
    const s = createSyncer({ dispatch: (e) => events.push(e), storage: memoryStorage(), fetchImpl: f, ...noRetry });
    const p1 = s.syncNow();
    const p2 = s.syncNow();
    const p3 = s.syncNow();
    assert.equal(p1, p2);
    assert.equal(p2, p3);
    release();
    await Promise.all([p1, p2, p3]);
    assert.equal(f.calls.length, 1);
    assert.equal(events.length, 1);
    await s.syncNow();
    assert.equal(f.calls.length, 2);
  });

  test('échec : SYNC_FAIL {error, at}, données conservées, cache intact, ne lève pas', async () => {
    const storage = memoryStorage();
    writeCache(storage, [story('a')], 1);
    const before = storage.data[CACHE_KEY];
    for (const handler of [
      () => jsonResponse('x', 404),
      () => jsonResponse('x', 500),
      () => { throw new TypeError('fetch failed'); },
      () => jsonResponse('{oups'),
      () => jsonResponse([]),
    ]) {
      const events = [];
      const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(handler), now: () => 9, ...noRetry });
      await s.syncNow();
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'SYNC_FAIL');
      assert.equal(typeof events[0].error, 'string');
      assert.ok(events[0].error.length > 0);
      assert.equal(events[0].at, 9);
      assert.equal(storage.data[CACHE_KEY], before);
    }
  });

  test('mode hors connexion : cache affiché puis SYNC_FAIL, sans DATA vide', async () => {
    const storage = memoryStorage();
    writeCache(storage, [story('a'), story('b')], 100);
    const events = [];
    const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(() => { throw new TypeError('getaddrinfo ENOTFOUND'); }), ...noRetry });
    assert.equal(s.loadCached(), true);
    await s.syncNow();
    assert.deepEqual(events.map((e) => e.type), ['DATA', 'SYNC_FAIL']);
    assert.deepEqual(events[0].stories, [story('a'), story('b')]);
    assert.equal(events[0].source, 'cache');
    assert.equal(events[1].code, 'NETWORK');
  });

  test('retour de connexion après échec : DATA si contenu différent du cache', async () => {
    const storage = memoryStorage();
    writeCache(storage, [story('a')], 1);
    let online = false;
    const events = [];
    const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(() => { if (!online) throw new TypeError('offline'); return jsonResponse([story('a'), story('nouveau')]); }), ...noRetry });
    s.loadCached();
    await s.syncNow();
    online = true;
    await s.syncNow();
    assert.deepEqual(events.map((e) => e.type), ['DATA', 'SYNC_FAIL', 'DATA']);
    assert.equal(events[2].source, 'remote');
    assert.equal(events[2].stories.length, 2);
  });

  test('timeout dans le syncer : SYNC_FAIL code TIMEOUT', async () => {
    const events = [];
    const s = createSyncer({ dispatch: (e) => events.push(e), storage: memoryStorage(), fetchImpl: () => new Promise(() => {}), timeoutMs: 20, ...noRetry });
    await s.syncNow();
    assert.equal(events[0].type, 'SYNC_FAIL');
    assert.equal(events[0].code, 'TIMEOUT');
  });

  test('un dispatch qui lève ne casse pas syncNow', async () => {
    const s = createSyncer({ dispatch: () => { throw new Error('rendu'); }, storage: memoryStorage(), fetchImpl: fakeFetch(() => jsonResponse([story('a')])), ...noRetry });
    await s.syncNow();
    const s2 = createSyncer({ dispatch: () => { throw new Error('rendu'); }, storage: memoryStorage(), fetchImpl: fakeFetch(() => { throw new Error('x'); }), ...noRetry });
    await s2.syncNow();
  });

  test('stockage plein : la synchro réussit quand même', async () => {
    const events = [];
    const storage = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
    const s = createSyncer({ dispatch: (e) => events.push(e), storage, fetchImpl: fakeFetch(() => jsonResponse([story('a')])), ...noRetry });
    await s.syncNow();
    assert.equal(events[0].type, 'DATA');
  });

  test('options absentes : aucune exception', async () => {
    const s = createSyncer({ storage: null, fetchImpl: fakeFetch(() => jsonResponse([story('a')])), ...noRetry });
    assert.equal(s.loadCached(), false);
    await s.syncNow();
  });

  test('nouvelles tentatives : 30 s puis 60 s, plafonnées, remises à zéro après succès', async () => {
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; };
    const clearTimeoutImpl = (id) => { if (timers[id]) timers[id].cleared = true; };
    let fail = true;
    const f = fakeFetch(() => { if (fail) throw new TypeError('offline'); return jsonResponse([story('a')]); });
    const events = [];
    const s = createSyncer({ dispatch: (e) => events.push(e), storage: memoryStorage(), fetchImpl: f, setTimeoutImpl, clearTimeoutImpl });
    await s.syncNow();
    assert.deepEqual(timers.map((t) => t.ms), [30000]);
    timers[0].fn();
    await s.syncNow();
    assert.deepEqual(timers.map((t) => t.ms), [30000, 60000]);
    timers[1].fn();
    await s.syncNow();
    assert.equal(timers.length, 2, 'pas de troisième tentative rapide');
    assert.equal(f.calls.length, 3);
    fail = false;
    await s.syncNow();
    assert.equal(events.at(-1).type, 'DATA');
    fail = true;
    await s.syncNow();
    assert.equal(timers.at(-1).ms, 30000, 'compteur remis à zéro après succès');
  });

  test('syncNow manuel annule la tentative programmée ; dispose aussi', async () => {
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; };
    const clearTimeoutImpl = (id) => { timers[id].cleared = true; };
    const s = createSyncer({ storage: memoryStorage(), fetchImpl: fakeFetch(() => { throw new Error('x'); }), setTimeoutImpl, clearTimeoutImpl });
    await s.syncNow();
    await s.syncNow();
    assert.equal(timers[0].cleared, true);
    s.dispose();
    assert.equal(timers[1].cleared, true);
    await s.syncNow();
    assert.equal(timers.length, 2, 'aucune tentative après dispose');
  });
});

describe('réseau réel (ignoré si SYNC_LIVE n\'est pas défini)', { skip: !process.env.SYNC_LIVE }, () => {
  test('l\'URL raw GitHub répond et toutes les histoires sont valides', async () => {
    const stories = await fetchRemoteStories({ timeoutMs: 20000 });
    assert.ok(stories.length > 0);
  });
});

describe('cohérence avec schema/stories.schema.json', () => {
  const schema = JSON.parse(readFileSync(join(root, 'schema/stories.schema.json'), 'utf8'));
  const def = schema.$defs.story;

  test('schéma draft 2020-12, champs requis identiques au module', () => {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'array');
    assert.deepEqual(def.required, ['id', 'name', 'lowest', 'comeback']);
    assert.equal(def.properties.id.pattern, '^[a-z0-9-]+$');
  });

  test('tout champ conservé par validateStories est décrit dans le schéma', () => {
    const all = story('x', {
      category: 'c', lesson: 'l', wikipedia: 'w', photo: 'photos/x.jpg', image_url: 'https://a.org/x.jpg',
      image_credit: 'c', image_license: 'l', image_source: 'https://a.org/f', sources: ['https://a.org'],
    });
    const kept = Object.keys(validateStories([all]).stories[0]).sort();
    assert.deepEqual(kept, Object.keys(def.properties).sort());
  });
});
