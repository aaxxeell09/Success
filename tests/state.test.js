// Tests du module pur widget/mur-des-retournements.widget/lib/state.js
// selon le contrat de docs/ARCHITECTURE.md. Lancement : node --test tests/
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = path.join(ROOT, 'widget/mur-des-retournements.widget/lib/state.js');

assert.ok(existsSync(STATE_PATH), `Module introuvable : ${STATE_PATH} (exigé par docs/ARCHITECTURE.md)`);
const mod = await import(pathToFileURL(STATE_PATH).href);
const { SIZES, ROTATION_MS, PREFS_KEY, createInitialState, reducer, loadPrefs, savePrefs, photoCandidates } = mod;

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
  assert.ok(Number.isInteger(p.size) && p.size >= 0 && p.size <= 2, `size invalide : ${p.size}`);
  assert.equal(typeof p.paused, 'boolean');
};

describe('constantes du contrat', () => {
  test('SIZES, ROTATION_MS, PREFS_KEY', () => {
    assert.deepEqual(SIZES, [{ key: 'S', width: 320 }, { key: 'M', width: 420 }, { key: 'L', width: 540 }]);
    assert.equal(ROTATION_MS, 20 * 60 * 1000);
    assert.equal(PREFS_KEY, 'mur-des-retournements-settings-v2');
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
    assert.ok(Number.isInteger(s.size) && s.size >= 0 && s.size <= 2);
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
  test('liste vide : NEXT/PREV/TICK/SIZE/TOGGLE_PAUSE ne lèvent pas', () => {
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

describe('reducer : taille', () => {
  test('SIZE accepte 0, 1, 2', () => {
    for (const n of [0, 1, 2]) assert.equal(run(fresh(), { type: 'SIZE', size: n }).size, n);
  });
  test('SIZE est bornée à 0..2 (valeur ramenée dans les bornes ou ignorée)', () => {
    const start = fresh();
    const cases = [[7, 2], [-3, 0], [3, 2], ['abc'], [null], [undefined], [NaN], [{}], [Infinity], [1.5]];
    for (const [bad, clamped] of cases) {
      const size = run(start, { type: 'SIZE', size: bad }).size;
      assert.ok(Number.isInteger(size) && size >= 0 && size <= 2, `taille invalide pour ${String(bad)} : ${size}`);
      const allowed = clamped === undefined ? [start.size, 0, 1, 2] : [clamped, start.size];
      assert.ok(allowed.includes(size), `taille ${size} inattendue pour ${String(bad)}`);
    }
  });
});

describe('reducer : RESTORE', () => {
  test('préférences valides appliquées', () => {
    const s = run(fresh(), { type: 'RESTORE', prefs: { currentId: 'c', size: 2, paused: true }, now: T0 });
    assert.equal(s.currentId, 'c');
    assert.equal(s.size, 2);
    assert.equal(s.paused, true);
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
      assert.ok(Number.isInteger(s.size) && s.size >= 0 && s.size <= 2, `size invalide pour ${JSON.stringify(prefs)} : ${s.size}`);
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
    const s = run(fresh(), { type: 'NEXT', now: T0 }, { type: 'SIZE', size: 2 }, { type: 'TOGGLE_PAUSE', now: T0 });
    savePrefs(storage, s);
    assert.ok(storage.data[PREFS_KEY], `clé ${PREFS_KEY} écrite`);
    assert.doesNotThrow(() => JSON.parse(storage.data[PREFS_KEY]));
    const p = loadPrefs(storage);
    assert.equal(p.currentId, 'b');
    assert.equal(p.size, 2);
    assert.equal(p.paused, true);
  });
  test('stockage vide : valeurs par défaut valides', () => {
    const p = loadPrefs(memoryStorage());
    assertValidPrefs(p);
    assert.equal(p.paused, false);
    assert.ok(p.currentId === null || p.currentId === undefined);
  });
  test('JSON corrompu : ne lève pas, valeurs valides', () => {
    for (const raw of ['{pas du json', 'null', '"texte"', '42', '[]', '{"size":99,"paused":"oui","currentId":5}']) {
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
    assert.equal(s.size, 0);
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
