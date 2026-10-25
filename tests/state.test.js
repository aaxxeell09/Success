// Tests du module pur widget/mur-des-retournements.widget/lib/state.js
// selon le contrat v3 (plus de taille, carte fixe CARD_WIDTH x CARD_HEIGHT, préférences v3). Lancement : node --test tests/
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'widget/mur-des-retournements.widget/lib/state.js');

assert.ok(existsSync(STATE_PATH), `Module introuvable : ${STATE_PATH} (exigé par docs/ARCHITECTURE.md)`);
const mod = await import(pathToFileURL(STATE_PATH).href);
const { CARD_WIDTH, CARD_HEIGHT, ROTATION_MS, PREFS_KEY, createInitialState, reducer, loadPrefs, savePrefs, photoCandidates } = mod;

const PREFS_V2 = 'mur-des-retournements-settings-v2';
const PREFS_V1 = 'mur-des-retournements-settings-v1';
const RAW_WIDGET = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/widget/mur-des-retournements.widget/';
const T0 = 1_700_000_000_000;
const MIN = 60 * 1000;

const story = (id, extra = {}) => ({
  id,
  name: `Personne ${id}`,
  lowest: `Épreuve de ${id}.`,
  comeback: `Retournement de ${id}.`,
  ...extra,
});
const STORIES = [story('a'), story('b'), story('c')];

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
};
// Applique une suite d'événements sur un état gelé (vérifie au passage la pureté).
const run = (state, ...events) => events.reduce((s, e) => reducer(deepFreeze(s), e), state);
const fresh = (stories = STORIES, now = T0) => createInitialState(structuredClone(stories), now);

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
};
const throwingStorage = () => ({
  getItem() { throw new Error('stockage indisponible'); },
  setItem() { throw new Error('quota dépassé'); },
  removeItem() { throw new Error('stockage indisponible'); },
});

const assertValidPrefs = (p) => {
  assert.equal(typeof p, 'object');
  assert.ok(p !== null);
  assert.ok(p.currentId === null || p.currentId === undefined || typeof p.currentId === 'string',
    `currentId doit être une chaîne ou null, reçu ${JSON.stringify(p.currentId)}`);
  assert.equal(typeof p.paused, 'boolean');
  assert.ok(!('size' in p), `loadPrefs ne doit plus retourner de taille : ${JSON.stringify(p)}`);
  assert.deepEqual(Object.keys(p).sort(), ['currentId', 'paused']);
};

describe('constantes du contrat', () => {
  test('CARD_WIDTH, CARD_HEIGHT, ROTATION_MS, PREFS_KEY', () => {
    assert.equal(CARD_WIDTH, 350);
    assert.equal(CARD_HEIGHT, 490);
    assert.equal(ROTATION_MS, 20 * 60 * 1000);
    assert.equal(PREFS_KEY, 'mur-des-retournements-settings-v3');
  });
  test('plus aucune notion de taille exportée (SIZES, SIZE)', () => {
    assert.ok(!('SIZES' in mod), 'SIZES ne doit plus être exporté');
    assert.ok(!('SIZE' in mod), 'SIZE ne doit plus être exporté');
  });
  test('fonctions exportées', () => {
    for (const f of [createInitialState, reducer, loadPrefs, savePrefs, photoCandidates]) {
      assert.equal(typeof f, 'function');
    }
  });
});

describe('createInitialState', () => {
  test('état initial complet, première histoire courante', () => {
    const s = fresh();
    assert.deepEqual(s.stories.map((x) => x.id), ['a', 'b', 'c']);
    assert.equal(s.currentId, 'a');
    assert.ok(!('size' in s), 'state.size ne doit plus exister');
    assert.equal(s.paused, false);
    assert.equal(s.lastAdvanceAt, T0);
    assert.equal(typeof s.photos, 'object');
    for (const key of ['lastSync', 'syncError', 'source']) assert.ok(key in s, `champ manquant : ${key}`);
    assert.ok(!s.syncError, 'pas d’erreur de synchronisation au départ');
  });
  test('liste vide : ne lève pas', () => {
    const s = createInitialState([], T0);
    assert.ok(Array.isArray(s.stories));
    assert.equal(s.stories.length, 0);
  });
});

describe('reducer : navigation', () => {
  test('NEXT est circulaire', () => {
    const s = fresh();
    assert.equal(run(s, { type: 'NEXT', now: T0 }).currentId, 'b');
    assert.equal(run(s, { type: 'NEXT', now: T0 }, { type: 'NEXT', now: T0 }).currentId, 'c');
    assert.equal(run(s, ...Array(3).fill({ type: 'NEXT', now: T0 })).currentId, 'a');
  });
  test('PREV est circulaire', () => {
    const s = fresh();
    assert.equal(run(s, { type: 'PREV', now: T0 }).currentId, 'c');
    assert.equal(run(s, { type: 'PREV', now: T0 }, { type: 'PREV', now: T0 }).currentId, 'b');
    assert.equal(run(s, { type: 'NEXT', now: T0 }, { type: 'PREV', now: T0 }).currentId, 'a');
  });
  test('la personne courante est mémorisée par id', () => {
    const s = run(fresh(), { type: 'NEXT', now: T0 });
    assert.equal(s.currentId, 'b');
    assert.equal(typeof s.currentId, 'string');
  });
  test('une seule histoire : NEXT/PREV restent dessus', () => {
    const s = fresh([story('seule')]);
    assert.equal(run(s, { type: 'NEXT', now: T0 }).currentId, 'seule');
    assert.equal(run(s, { type: 'PREV', now: T0 }).currentId, 'seule');
  });
  test('liste vide : NEXT/PREV/TICK/SIZE (ignoré)/TOGGLE_PAUSE ne lèvent pas', () => {
    const s = createInitialState([], T0);
    assert.doesNotThrow(() => run(s,
      { type: 'NEXT', now: T0 }, { type: 'PREV', now: T0 },
      { type: 'TICK', now: T0 + ROTATION_MS * 2 }, { type: 'SIZE', size: 2 },
      { type: 'TOGGLE_PAUSE', now: T0 }, { type: 'SYNC_FAIL', error: 'x', at: T0 }));
  });
  test('le réducteur ne modifie pas l’état reçu (pur)', () => {
    const s = deepFreeze(fresh());
    const snapshot = structuredClone(s);
    for (const e of [{ type: 'NEXT', now: T0 }, { type: 'SIZE', size: 0 }, { type: 'TOGGLE_PAUSE', now: T0 },
      { type: 'DATA', stories: [story('z')], source: 'remote', at: T0 }, { type: 'PHOTOS', photos: { x: 'https://e/x.jpg' } }]) {
      reducer(s, e);
    }
    assert.deepEqual(s, snapshot);
  });
  test('événement inconnu : état inchangé', () => {
    const s = fresh();
    assert.deepEqual(reducer(s, { type: 'INCONNU' }), s);
  });
});

describe('reducer : rotation automatique', () => {
  test('TICK avant 20 minutes ne change rien', () => {
    const s = fresh();
    assert.equal(run(s, { type: 'TICK', now: T0 + MIN }).currentId, 'a');
    assert.equal(run(s, { type: 'TICK', now: T0 + ROTATION_MS - 1 }).currentId, 'a');
  });
  test('TICK à 20 minutes avance et remet le minuteur', () => {
    const s = run(fresh(), { type: 'TICK', now: T0 + ROTATION_MS });
    assert.equal(s.currentId, 'b');
    assert.equal(s.lastAdvanceAt, T0 + ROTATION_MS);
    // Une minute plus tard : pas de nouvelle avance.
    assert.equal(run(s, { type: 'TICK', now: T0 + ROTATION_MS + MIN }).currentId, 'b');
    // Vingt minutes après la dernière avance : nouvelle avance.
    assert.equal(run(s, { type: 'TICK', now: T0 + 2 * ROTATION_MS }).currentId, 'c');
  });
  test('la pause bloque la rotation, la reprise la rétablit', () => {
    const paused = run(fresh(), { type: 'TOGGLE_PAUSE', now: T0 });
    assert.equal(paused.paused, true);
    const later = run(paused, { type: 'TICK', now: T0 + 3 * ROTATION_MS });
    assert.equal(later.currentId, 'a', 'aucune avance en pause');
    const resumeAt = T0 + 3 * ROTATION_MS + MIN;
    const resumed = run(later, { type: 'TOGGLE_PAUSE', now: resumeAt });
    assert.equal(resumed.paused, false);
    assert.equal(run(resumed, { type: 'TICK', now: resumeAt + ROTATION_MS }).currentId, 'b');
  });
  test('la navigation manuelle remet le minuteur', () => {
    const t = T0 + 15 * MIN;
    const s = run(fresh(), { type: 'NEXT', now: t });
    assert.equal(s.currentId, 'b');
    assert.equal(s.lastAdvanceAt, t);
    // 20 minutes après T0 mais seulement 5 après le clic : pas d'avance.
    assert.equal(run(s, { type: 'TICK', now: T0 + ROTATION_MS }).currentId, 'b');
    assert.equal(run(s, { type: 'TICK', now: t + ROTATION_MS }).currentId, 'c');
    const p = run(fresh(), { type: 'PREV', now: t });
    assert.equal(p.lastAdvanceAt, t);
  });
});

describe('reducer : SIZE ignoré (plus de taille)', () => {
  test('SIZE laisse l’état inchangé, quelle que soit la valeur', () => {
    const start = run(fresh(), { type: 'NEXT', now: T0 });
    for (const size of [0, 1, 2, 7, -1, 'L', null, undefined]) {
      const next = reducer(deepFreeze(start), { type: 'SIZE', size });
      assert.deepEqual(next, start, `SIZE ${String(size)} ne doit rien changer`);
      assert.ok(!('size' in next), 'aucun champ size créé');
    }
  });
  test('aucun événement ne crée de champ size', () => {
    const s = run(fresh(), { type: 'RESTORE', prefs: { currentId: 'b', size: 2, paused: true }, now: T0 },
      { type: 'NEXT', now: T0 }, { type: 'TOGGLE_PAUSE', now: T0 }, { type: 'TICK', now: T0 + ROTATION_MS },
      { type: 'DATA', stories: STORIES, source: 'remote', at: T0 }, { type: 'SYNC_OK', at: T0 },
      { type: 'SYNC_FAIL', error: 'x', at: T0 }, { type: 'PHOTOS', photos: { A: 'https://e/a.jpg' } });
    assert.ok(!('size' in s), `champ size inattendu : ${JSON.stringify(s.size)}`);
  });
});

describe('reducer : RESTORE', () => {
  test('préférences valides appliquées', () => {
    const s = run(fresh(), { type: 'RESTORE', prefs: { currentId: 'c', size: 2, paused: true }, now: T0 });
    assert.equal(s.currentId, 'c');
    assert.equal(s.paused, true);
    assert.ok(!('size' in s), 'la taille des anciennes préférences est ignorée');
  });
  test('préférences invalides ou corrompues : état valide', () => {
    const corrupt = [
      null, undefined, 'texte', 42, [],
      { currentId: 'inexistant', size: 9, paused: 'oui' },
      { currentId: 3, size: -1, paused: 1 },
      { currentId: null, size: 'L', paused: null },
      { size: 1.5 },
    ];
    for (const prefs of corrupt) {
      const s = run(fresh(), { type: 'RESTORE', prefs, now: T0 });
      assert.ok(['a', 'b', 'c'].includes(s.currentId), `currentId invalide pour ${JSON.stringify(prefs)} : ${s.currentId}`);
      assert.ok(!('size' in s), `size inattendu pour ${JSON.stringify(prefs)}`);
      assert.equal(typeof s.paused, 'boolean');
      assert.equal(s.stories.length, 3);
    }
  });
  test('id disparu : première histoire', () => {
    const s = run(fresh(), { type: 'RESTORE', prefs: { currentId: 'supprime', size: 1, paused: false }, now: T0 });
    assert.equal(s.currentId, 'a');
  });
});

describe('reducer : données et synchronisation', () => {
  test('DATA qui ajoute une histoire ne déplace pas l’histoire courante', () => {
    const s = run(fresh(), { type: 'NEXT', now: T0 });
    assert.equal(s.currentId, 'b');
    const next = run(s, { type: 'DATA', stories: [story('nouvelle'), ...STORIES], source: 'remote', at: T0 + MIN });
    assert.equal(next.currentId, 'b');
    assert.equal(next.stories.length, 4);
    assert.deepEqual(next.stories.map((x) => x.id), ['nouvelle', 'a', 'b', 'c']);
    assert.equal(next.source, 'remote');
    assert.equal(next.lastSync, T0 + MIN);
    assert.ok(!next.syncError);
  });
  test('DATA met à jour le contenu de l’histoire courante', () => {
    const changed = STORIES.map((x) => (x.id === 'a' ? { ...x, comeback: 'Texte corrigé.' } : x));
    const s = run(fresh(), { type: 'DATA', stories: changed, source: 'remote', at: T0 });
    assert.equal(s.currentId, 'a');
    assert.equal(s.stories.find((x) => x.id === 'a').comeback, 'Texte corrigé.');
  });
  test('DATA qui retire l’histoire courante : retour à la première', () => {
    const s = run(fresh(), { type: 'NEXT', now: T0 }, { type: 'NEXT', now: T0 });
    assert.equal(s.currentId, 'c');
    const next = run(s, { type: 'DATA', stories: [story('x'), story('a')], source: 'remote', at: T0 });
    assert.equal(next.currentId, 'x');
  });
  test('DATA depuis le cache garde la source', () => {
    const s = run(fresh(), { type: 'DATA', stories: STORIES, source: 'cache', at: T0 });
    assert.equal(s.source, 'cache');
  });
  test('DATA avec une liste vide conserve les histoires affichées', () => {
    const s = run(fresh(), { type: 'NEXT', now: T0 }, { type: 'DATA', stories: [], source: 'remote', at: T0 });
    assert.equal(s.stories.length, 3);
    assert.equal(s.currentId, 'b');
  });
  test('SYNC_FAIL conserve les histoires et signale l’erreur', () => {
    const s = run(fresh(), { type: 'NEXT', now: T0 });
    const failed = run(s, { type: 'SYNC_FAIL', error: 'Failed to fetch', at: T0 + MIN });
    assert.deepEqual(failed.stories, s.stories);
    assert.equal(failed.currentId, 'b');
    assert.ok(failed.syncError, 'syncError doit être renseigné');
  });
  test('SYNC_OK efface l’erreur et date la synchronisation', () => {
    const failed = run(fresh(), { type: 'SYNC_FAIL', error: 'x', at: T0 });
    const ok = run(failed, { type: 'SYNC_OK', at: T0 + 5 * MIN });
    assert.ok(!ok.syncError);
    assert.equal(ok.lastSync, T0 + 5 * MIN);
    assert.equal(ok.stories.length, 3);
  });
  test('DATA après SYNC_FAIL efface l’erreur', () => {
    const s = run(fresh(), { type: 'SYNC_FAIL', error: 'x', at: T0 },
      { type: 'DATA', stories: [...STORIES, story('d')], source: 'remote', at: T0 + MIN });
    assert.ok(!s.syncError);
    assert.equal(s.stories.length, 4);
  });
  test('PHOTOS fusionne les vignettes', () => {
    const s = run(fresh(), { type: 'PHOTOS', photos: { A: 'https://e/a.jpg' } }, { type: 'PHOTOS', photos: { B: 'https://e/b.jpg' } });
    assert.deepEqual(s.photos, { A: 'https://e/a.jpg', B: 'https://e/b.jpg' });
  });
});

describe('loadPrefs / savePrefs', () => {
  test('aller-retour', () => {
    const storage = memoryStorage();
    const s = run(fresh(), { type: 'NEXT', now: T0 }, { type: 'TOGGLE_PAUSE', now: T0 });
    savePrefs(storage, s);
    assert.ok(storage.data[PREFS_KEY], `clé ${PREFS_KEY} écrite`);
    assert.deepEqual(JSON.parse(storage.data[PREFS_KEY]), { currentId: 'b', paused: true }, 'v3 = { currentId, paused } uniquement');
    assert.deepEqual(loadPrefs(storage), { currentId: 'b', paused: true });
  });
  test('stockage vide : valeurs par défaut valides', () => {
    const p = loadPrefs(memoryStorage());
    assertValidPrefs(p);
    assert.equal(p.paused, false);
    assert.ok(p.currentId === null || p.currentId === undefined);
  });
  test('JSON corrompu : ne lève pas, valeurs valides', () => {
    for (const raw of ['{pas du json', 'null', '"texte"', '42', '[]', '{"size":99,"paused":"oui","currentId":5}', '{"currentId":"","paused":1}']) {
      let p;
      assert.doesNotThrow(() => { p = loadPrefs(memoryStorage({ [PREFS_KEY]: raw })); }, raw);
      assertValidPrefs(p);
      assert.notEqual(p.currentId, 5);
    }
  });
  test('stockage qui lève : ne lève pas', () => {
    let p;
    assert.doesNotThrow(() => { p = loadPrefs(throwingStorage()); });
    assertValidPrefs(p);
    assert.doesNotThrow(() => savePrefs(throwingStorage(), fresh()));
  });
  test('stockage dont seul removeItem lève : v3 écrit quand même, ne lève pas', () => {
    const storage = memoryStorage({ [PREFS_V2]: '{"currentId":"a","size":0,"paused":false}' });
    storage.removeItem = () => { throw new Error('interdit'); };
    assert.doesNotThrow(() => savePrefs(storage, run(fresh(), { type: 'PREV', now: T0 })));
    assert.deepEqual(JSON.parse(storage.data[PREFS_KEY]), { currentId: 'c', paused: false });
  });
  test('stockage sans removeItem : ne lève pas', () => {
    const storage = memoryStorage();
    delete storage.removeItem;
    assert.doesNotThrow(() => savePrefs(storage, fresh()));
    assert.ok(storage.data[PREFS_KEY]);
  });
  test('stockage absent : ne lève pas', () => {
    for (const storage of [null, undefined, {}]) {
      let p;
      assert.doesNotThrow(() => { p = loadPrefs(storage); });
      assertValidPrefs(p);
      assert.doesNotThrow(() => savePrefs(storage, fresh()));
    }
  });
  test('préférences enregistrées puis RESTORE', () => {
    const storage = memoryStorage();
    savePrefs(storage, run(fresh(), { type: 'PREV', now: T0 }, { type: 'SIZE', size: 0 }));
    const s = run(fresh(), { type: 'RESTORE', prefs: loadPrefs(storage), now: T0 });
    assert.equal(s.currentId, 'c');
    assert.ok(!('size' in s));
  });
  test('savePrefs ignore une éventuelle taille présente dans l’état', () => {
    const storage = memoryStorage();
    savePrefs(storage, { ...fresh(), size: 2 });
    assert.deepEqual(Object.keys(JSON.parse(storage.data[PREFS_KEY])).sort(), ['currentId', 'paused']);
  });
});

describe('migration des préférences v2 et v1 vers v3', () => {
  test('v2 seule : currentId et paused conservés, taille ignorée', () => {
    const storage = memoryStorage({ [PREFS_V2]: JSON.stringify({ currentId: 'c', size: 2, paused: true }) });
    assert.deepEqual(loadPrefs(storage), { currentId: 'c', paused: true });
  });
  test('v1 seule : currentId et paused conservés, taille ignorée', () => {
    const storage = memoryStorage({ [PREFS_V1]: JSON.stringify({ currentId: 'b', size: 0, paused: true }) });
    assert.deepEqual(loadPrefs(storage), { currentId: 'b', paused: true });
  });
  test('ordre de priorité : v3, puis v2, puis v1', () => {
    const all = {
      [PREFS_KEY]: JSON.stringify({ currentId: 'a', paused: false }),
      [PREFS_V2]: JSON.stringify({ currentId: 'b', size: 1, paused: true }),
      [PREFS_V1]: JSON.stringify({ currentId: 'c', size: 2, paused: true }),
    };
    assert.deepEqual(loadPrefs(memoryStorage(all)), { currentId: 'a', paused: false });
    const { [PREFS_KEY]: _v3, ...noV3 } = all;
    assert.deepEqual(loadPrefs(memoryStorage(noV3)), { currentId: 'b', paused: true });
  });
  test('v2 corrompue : repli sur v1', () => {
    const storage = memoryStorage({ [PREFS_V2]: '{corrompu', [PREFS_V1]: JSON.stringify({ currentId: 'c', size: 0, paused: true }) });
    assertValidPrefs(loadPrefs(storage));
    assert.deepEqual(loadPrefs(storage), { currentId: 'c', paused: true });
  });
  test('savePrefs écrit v3 et supprime les clés v1 et v2', () => {
    const storage = memoryStorage({
      [PREFS_V2]: JSON.stringify({ currentId: 'b', size: 2, paused: true }),
      [PREFS_V1]: JSON.stringify({ currentId: 'c', size: 0, paused: false }),
      autre: 'conservée',
    });
    const s = run(fresh(), { type: 'RESTORE', prefs: loadPrefs(storage), now: T0 });
    assert.equal(s.currentId, 'b');
    assert.equal(s.paused, true);
    savePrefs(storage, s);
    assert.deepEqual(JSON.parse(storage.data[PREFS_KEY]), { currentId: 'b', paused: true });
    assert.ok(!(PREFS_V2 in storage.data), 'clé v2 supprimée');
    assert.ok(!(PREFS_V1 in storage.data), 'clé v1 supprimée');
    assert.equal(storage.data.autre, 'conservée', 'les autres clés ne sont pas touchées');
    assert.deepEqual(loadPrefs(storage), { currentId: 'b', paused: true });
  });
  test('id de v2 disparu des données : retour à la première histoire', () => {
    const storage = memoryStorage({ [PREFS_V2]: JSON.stringify({ currentId: 'jobs', size: 1, paused: false }) });
    const s = run(fresh(), { type: 'RESTORE', prefs: loadPrefs(storage), now: T0 });
    assert.equal(s.currentId, 'a');
  });
});

describe('photoCandidates', () => {
  const full = story('mandela', {
    photo: 'photos/mandela.jpg',
    image_url: 'https://upload.wikimedia.org/mandela.jpg',
    wikipedia: 'Nelson Mandela',
  });
  const wiki = { 'Nelson Mandela': 'https://upload.wikimedia.org/thumb/mandela-750.jpg' };
  const norm = (list) => list.map((u, i) => (i === 0 ? u.replace(/^\//, '') : u));

  test('ordre exact du contrat', () => {
    const list = photoCandidates(full, wiki);
    assert.ok(Array.isArray(list));
    assert.deepEqual(norm(list), [
      'mur-des-retournements.widget/photos/mandela.jpg',
      `${RAW_WIDGET}photos/mandela.jpg`,
      'https://upload.wikimedia.org/mandela.jpg',
      'https://upload.wikimedia.org/thumb/mandela-750.jpg',
    ]);
  });
  test('sans doublons', () => {
    const same = { ...full, image_url: wiki['Nelson Mandela'] };
    const list = photoCandidates(same, wiki);
    assert.equal(new Set(list).size, list.length);
    assert.equal(list.length, 3);
    assert.equal(list[2], wiki['Nelson Mandela']);
  });
  test('histoire sans photo locale : image_url puis Wikipédia', () => {
    const { photo, ...noPhoto } = full;
    assert.deepEqual(photoCandidates(noPhoto, wiki), [
      'https://upload.wikimedia.org/mandela.jpg',
      'https://upload.wikimedia.org/thumb/mandela-750.jpg',
    ]);
  });
  test('vignette Wikipédia absente ou carte non fournie', () => {
    const { photo, image_url, ...onlyWiki } = full;
    assert.deepEqual(photoCandidates(onlyWiki, {}), []);
    assert.doesNotThrow(() => photoCandidates(onlyWiki, undefined));
    assert.deepEqual(photoCandidates(onlyWiki, undefined), []);
  });
  test('aucune source : liste vide (les initiales sont gérées par l’interface)', () => {
    assert.deepEqual(photoCandidates(story('anonyme'), wiki), []);
  });
  test('ne renvoie que des chaînes non vides', () => {
    const list = photoCandidates({ ...full, image_url: '' }, { 'Nelson Mandela': '' });
    assert.ok(list.every((u) => typeof u === 'string' && u.length > 0));
    assert.equal(list.length, 2);
  });
});
