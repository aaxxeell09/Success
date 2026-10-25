// État de l'interface du widget « Le mur des retournements ».
// Module ES pur : aucun JSX, aucun import d'Übersicht, aucun accès global
// implicite. Le temps (`now`) et le stockage (`storage`) sont toujours injectés,
// ce qui permet de tester ce module sous Node 22 (`node --test`).

// Taille fixe et compacte de la carte, en pixels (tient sous les widgets macOS).
// Le widget réduit la largeur seulement si l'écran est plus étroit ; la hauteur
// ne varie jamais : seul le texte défile.
export const CARD_WIDTH = 350;
export const CARD_HEIGHT = 490;
export const ROTATION_MS = 20 * 60 * 1000;
export const PREFS_KEY = 'mur-des-retournements-settings-v3';

// Anciennes clés (widgets v2 puis v1) : relues en repli pour conserver la
// personne courante et l'état de pause, puis supprimées au premier
// enregistrement. L'ancienne taille (S/M/L) qu'elles contiennent est ignorée.
const LEGACY_PREFS_KEYS = ['mur-des-retournements-settings-v2', 'mur-des-retournements-settings-v1'];

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/widget/mur-des-retournements.widget/';
const LOCAL_BASE = 'mur-des-retournements.widget/';

const asStories = (list) => (Array.isArray(list) ? list.filter((s) => s && typeof s.id === 'string') : []);
const hasId = (stories, id) => typeof id === 'string' && stories.some((s) => s.id === id);
const firstId = (stories) => (stories.length ? stories[0].id : null);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

// Index de la personne courante (0 si l'id a disparu ou si la liste est vide).
export function currentIndex(state) {
  const stories = asStories(state && state.stories);
  const i = stories.findIndex((s) => s.id === (state && state.currentId));
  return i >= 0 ? i : 0;
}

export function createInitialState(localStories, now) {
  const stories = asStories(localStories);
  return {
    stories,
    currentId: firstId(stories),
    paused: false,
    lastAdvanceAt: isNum(now) ? now : 0,
    photos: {},
    lastSync: null,
    syncError: null,
    source: 'local',
  };
}

// Déplacement circulaire de `delta` positions à partir de la personne courante.
function step(state, delta) {
  const stories = asStories(state.stories);
  if (!stories.length) return state.currentId;
  const n = stories.length;
  const i = currentIndex(state);
  return stories[(((i + delta) % n) + n) % n].id;
}

function errorText(error) {
  if (!error) return 'Erreur de synchronisation';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message) return error.message;
  return String(error);
}

export function reducer(state, event) {
  const s = state || createInitialState([], 0);
  if (!event || typeof event.type !== 'string') return s;
  const now = isNum(event.now) ? event.now : null;

  switch (event.type) {
    case 'RESTORE': {
      const prefs = event.prefs || {};
      const stories = asStories(s.stories);
      return {
        ...s,
        currentId: hasId(stories, prefs.currentId) ? prefs.currentId : (hasId(stories, s.currentId) ? s.currentId : firstId(stories)),
        paused: typeof prefs.paused === 'boolean' ? prefs.paused : s.paused,
        lastAdvanceAt: now !== null ? now : s.lastAdvanceAt,
      };
    }
    case 'NEXT':
    case 'PREV':
      return {
        ...s,
        currentId: step(s, event.type === 'NEXT' ? 1 : -1),
        lastAdvanceAt: now !== null ? now : s.lastAdvanceAt,
      };
    case 'TICK': {
      if (s.paused || now === null) return s;
      if (!isNum(s.lastAdvanceAt)) return { ...s, lastAdvanceAt: now };
      if (now - s.lastAdvanceAt < ROTATION_MS) return s;
      return { ...s, currentId: step(s, 1), lastAdvanceAt: now };
    }
    case 'TOGGLE_PAUSE':
      // À la reprise, le compte à rebours de 20 minutes repart de zéro.
      return { ...s, paused: !s.paused, lastAdvanceAt: now !== null ? now : s.lastAdvanceAt };
    case 'DATA': {
      const stories = asStories(event.stories);
      if (!stories.length) return s;
      return {
        ...s,
        stories,
        currentId: hasId(stories, s.currentId) ? s.currentId : firstId(stories),
        lastSync: isNum(event.at) ? event.at : s.lastSync,
        syncError: event.source === 'cache' ? s.syncError : null,
        source: typeof event.source === 'string' ? event.source : s.source,
      };
    }
    case 'SYNC_OK':
      return { ...s, lastSync: isNum(event.at) ? event.at : s.lastSync, syncError: null };
    case 'SYNC_FAIL':
      return { ...s, syncError: errorText(event.error) };
    case 'PHOTOS': {
      const incoming = event.photos && typeof event.photos === 'object' ? event.photos : {};
      const clean = {};
      for (const [title, url] of Object.entries(incoming)) {
        if (typeof url === 'string' && /^https:\/\//.test(url)) clean[title] = url;
      }
      if (!Object.keys(clean).length) return s;
      return { ...s, photos: { ...(s.photos || {}), ...clean } };
    }
    // Ancien événement SIZE (plus de taille réglable) et événements inconnus :
    // état inchangé.
    default:
      return s;
  }
}

function readJson(storage, key) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(key);
    if (typeof raw !== 'string' || !raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (_) {
    return null;
  }
}

// Préférences validées. `defaults` (facultatif) fournit les valeurs utilisées
// quand rien n'est enregistré, par exemple celles du bloc CONFIG du widget.
// Ne lève jamais.
export function loadPrefs(storage, defaults) {
  const d = defaults && typeof defaults === 'object' ? defaults : {};
  const fallback = {
    currentId: typeof d.currentId === 'string' ? d.currentId : null,
    paused: typeof d.paused === 'boolean' ? d.paused : false,
  };
  let saved = readJson(storage, PREFS_KEY);
  for (let i = 0; !saved && i < LEGACY_PREFS_KEYS.length; i += 1) saved = readJson(storage, LEGACY_PREFS_KEYS[i]);
  saved = saved || {};
  return {
    currentId: typeof saved.currentId === 'string' && saved.currentId ? saved.currentId : fallback.currentId,
    paused: typeof saved.paused === 'boolean' ? saved.paused : fallback.paused,
  };
}

// Écrit { currentId, paused } sous PREFS_KEY puis supprime les anciennes clés.
// Ne lève jamais (stockage absent, plein ou interdit).
export function savePrefs(storage, state) {
  if (!storage || typeof storage.setItem !== 'function' || !state) return;
  try {
    storage.setItem(PREFS_KEY, JSON.stringify({
      currentId: typeof state.currentId === 'string' ? state.currentId : null,
      paused: state.paused === true,
    }));
  } catch (_) {
    // Stockage indisponible : les préférences ne seront simplement pas gardées.
    return;
  }
  if (typeof storage.removeItem !== 'function') return;
  for (const key of LEGACY_PREFS_KEYS) {
    try { storage.removeItem(key); } catch (_) { /* clé ancienne laissée en place */ }
  }
}

// Chemin relatif sûr : pas de schéma, pas de chemin absolu, pas de « .. ».
const safeRelativePath = (p) =>
  typeof p === 'string' && p.trim() !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(p) &&
  !p.startsWith('/') && !p.startsWith('\\') && !p.split(/[\\/]/).includes('..');

const isHttps = (u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u);

// Liste ordonnée des URL de photo à essayer. Une liste vide signifie : initiales.
export function photoCandidates(story, wikiPhotos) {
  if (!story || typeof story !== 'object') return [];
  const out = [];
  const push = (u) => { if (u && !out.includes(u)) out.push(u); };
  if (safeRelativePath(story.photo)) {
    const rel = story.photo.trim().replace(/^\.\//, '');
    const encoded = rel.split('/').map(encodeURIComponent).join('/');
    push(LOCAL_BASE + encoded);
    push(REPO_RAW_BASE + encoded);
  }
  if (isHttps(story.image_url)) push(story.image_url);
  const photos = wikiPhotos && typeof wikiPhotos === 'object' ? wikiPhotos : {};
  if (typeof story.wikipedia === 'string' && isHttps(photos[story.wikipedia])) push(photos[story.wikipedia]);
  return out;
}
