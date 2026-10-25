// Synchronisation des histoires depuis GitHub, validation et cache local.
//
// Module ES pur : aucune dépendance, aucun JSX, aucun accès global implicite.
// `fetch`, `localStorage`, l'horloge et les minuteries sont injectables afin que
// le module fonctionne à l'identique dans la WebView d'Übersicht et sous Node 22.
// Syntaxe volontairement sobre (pas de `?.` ni de `??`) pour rester compatible
// avec les anciennes WebView.

export const DATA_URL = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json';
export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const CACHE_KEY = 'mur-des-retournements-stories-cache-v1';

// Délai d'expiration d'une requête distante.
export const FETCH_TIMEOUT_MS = 15 * 1000;
// Nouvelles tentatives rapides après un échec (puis on attend le cycle normal).
export const RETRY_DELAYS_MS = [30 * 1000, 60 * 1000];
// Longueur maximale d'un texte : au delà, le texte est tronqué (pas rejeté).
export const MAX_TEXT_LENGTH = 2000;
// Longueur maximale d'un identifiant : au delà, l'histoire est rejetée.
export const MAX_ID_LENGTH = 100;
// Nombre maximal d'adresses conservées dans `sources`.
export const MAX_SOURCES = 20;

const ID_PATTERN = /^[a-z0-9-]+$/;
const REQUIRED_FIELDS = ['name', 'lowest', 'comeback'];
const OPTIONAL_TEXT_FIELDS = ['category', 'lesson', 'wikipedia', 'image_credit', 'image_license'];
const HTTPS_URL_FIELDS = ['image_url', 'image_source'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Tronque sur une frontière de caractère Unicode (pas au milieu d'un emoji).
function truncate(text, max) {
  const chars = Array.from(text);
  if (chars.length <= max) return { text: text, truncated: false };
  return { text: chars.slice(0, max - 1).join('').trimEnd() + '…', truncated: true };
}

function charLength(text) {
  return Array.from(text).length;
}

function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  if (!/^https:\/\/[^\s/?#]+[^\s]*$/i.test(value)) return false;
  if (charLength(value) > MAX_TEXT_LENGTH) return false;
  return true;
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(value) && charLength(value) <= MAX_TEXT_LENGTH;
}

// Chemin relatif sûr, à l'intérieur du dossier du widget : ex. `photos/mandela.jpg`.
function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value === '' || charLength(value) > 300) return false;
  if (!/^[A-Za-z0-9._\/-]+$/.test(value)) return false;
  if (value.charAt(0) === '/' || value.indexOf('//') !== -1) return false;
  const parts = value.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === '..' || parts[i] === '.' || parts[i] === '') return false;
  }
  return true;
}

function describeId(raw) {
  return typeof raw === 'string' ? raw : null;
}

// Valide une liste d'histoires.
// Retour : { stories, rejected: [{ index, id, reason }], warnings: [{ index, id, field, reason }] }
// - Une entrée invalide est rejetée seule, jamais toute la liste.
// - Un champ optionnel invalide est retiré (avertissement), l'histoire est conservée.
// - Les champs inconnus sont ignorés.
// - Les textes de plus de MAX_TEXT_LENGTH caractères sont tronqués (avertissement).
export function validateStories(data) {
  const stories = [];
  const rejected = [];
  const warnings = [];

  if (!Array.isArray(data)) {
    rejected.push({ index: -1, id: null, reason: 'Le contenu doit être un tableau JSON [ ... ] d\'histoires' });
    return { stories: stories, rejected: rejected, warnings: warnings };
  }

  const seen = Object.create(null);

  for (let index = 0; index < data.length; index += 1) {
    const item = data[index];
    if (!isPlainObject(item)) {
      rejected.push({ index: index, id: null, reason: 'L\'entrée n\'est pas un objet { ... }' });
      continue;
    }

    const rawId = item.id;
    if (typeof rawId !== 'string' || rawId.trim() === '') {
      rejected.push({ index: index, id: null, reason: 'Champ « id » manquant ou vide' });
      continue;
    }
    const id = rawId.trim();
    if (id.length > MAX_ID_LENGTH) {
      rejected.push({ index: index, id: id.slice(0, 40), reason: 'Champ « id » trop long (plus de ' + MAX_ID_LENGTH + ' caractères)' });
      continue;
    }
    if (!ID_PATTERN.test(id)) {
      rejected.push({ index: index, id: id, reason: 'Champ « id » non conforme : uniquement minuscules sans accent, chiffres et tirets (ex. « nelson-mandela »)' });
      continue;
    }
    if (seen[id]) {
      rejected.push({ index: index, id: id, reason: 'Identifiant « ' + id + ' » déjà utilisé par l\'entrée n° ' + seen[id].index });
      continue;
    }

    const story = { id: id };
    let missing = null;
    for (let f = 0; f < REQUIRED_FIELDS.length; f += 1) {
      const field = REQUIRED_FIELDS[f];
      const value = item[field];
      if (typeof value !== 'string' || value.trim() === '') {
        missing = field;
        break;
      }
      const cut = truncate(value.trim(), MAX_TEXT_LENGTH);
      if (cut.truncated) warnings.push({ index: index, id: id, field: field, reason: 'Texte tronqué à ' + MAX_TEXT_LENGTH + ' caractères' });
      story[field] = cut.text;
    }
    if (missing) {
      rejected.push({ index: index, id: describeId(id), reason: 'Champ « ' + missing + ' » manquant, vide ou qui n\'est pas du texte' });
      continue;
    }

    for (let f = 0; f < OPTIONAL_TEXT_FIELDS.length; f += 1) {
      const field = OPTIONAL_TEXT_FIELDS[f];
      if (!(field in item) || item[field] === null || item[field] === undefined) continue;
      const value = item[field];
      if (typeof value !== 'string') {
        warnings.push({ index: index, id: id, field: field, reason: 'Champ retiré : texte attendu' });
        continue;
      }
      const trimmed = value.trim();
      if (trimmed === '') continue;
      const cut = truncate(trimmed, MAX_TEXT_LENGTH);
      if (cut.truncated) warnings.push({ index: index, id: id, field: field, reason: 'Texte tronqué à ' + MAX_TEXT_LENGTH + ' caractères' });
      story[field] = cut.text;
    }

    for (let f = 0; f < HTTPS_URL_FIELDS.length; f += 1) {
      const field = HTTPS_URL_FIELDS[f];
      if (!(field in item) || item[field] === null || item[field] === undefined) continue;
      const value = typeof item[field] === 'string' ? item[field].trim() : item[field];
      if (value === '') continue;
      if (!isHttpsUrl(value)) {
        warnings.push({ index: index, id: id, field: field, reason: 'Champ retiré : adresse https:// valide attendue' });
        continue;
      }
      story[field] = value;
    }

    if ('photo' in item && item.photo !== null && item.photo !== undefined) {
      const photo = typeof item.photo === 'string' ? item.photo.trim() : item.photo;
      if (photo !== '') {
        if (isSafeRelativePath(photo)) story.photo = photo;
        else warnings.push({ index: index, id: id, field: 'photo', reason: 'Champ retiré : chemin relatif attendu (ex. photos/' + id + '.jpg)' });
      }
    }

    if ('sources' in item && item.sources !== null && item.sources !== undefined) {
      if (!Array.isArray(item.sources)) {
        warnings.push({ index: index, id: id, field: 'sources', reason: 'Champ retiré : tableau d\'adresses attendu' });
      } else {
        const kept = [];
        let dropped = 0;
        for (let s = 0; s < item.sources.length; s += 1) {
          const src = typeof item.sources[s] === 'string' ? item.sources[s].trim() : item.sources[s];
          if (isHttpUrl(src) && kept.indexOf(src) === -1 && kept.length < MAX_SOURCES) kept.push(src);
          else dropped += 1;
        }
        if (dropped > 0) warnings.push({ index: index, id: id, field: 'sources', reason: dropped + ' adresse(s) invalide(s), en double ou en trop retirée(s)' });
        if (kept.length > 0) story.sources = kept;
      }
    }

    seen[id] = { index: index };
    stories.push(story);
  }

  return { stories: stories, rejected: rejected, warnings: warnings };
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (_) {
    return null;
  }
}

// Lit le cache. Retour : { stories, savedAt } ou null. Ne lève jamais.
// Le cache n'est retenu que s'il contient au moins une histoire valide.
export function readCache(storage) {
  try {
    const store = resolveStorage(storage);
    if (!store || typeof store.getItem !== 'function') return null;
    const raw = store.getItem(CACHE_KEY);
    if (typeof raw !== 'string' || raw === '') return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const stories = validateStories(parsed.stories).stories;
    if (stories.length === 0) return null;
    const savedAt = typeof parsed.savedAt === 'number' && isFinite(parsed.savedAt) ? parsed.savedAt : null;
    return { stories: stories, savedAt: savedAt };
  } catch (_) {
    return null;
  }
}

// Écrit le cache. Ne lève jamais (stockage absent, plein, refusé). Retourne true si écrit.
export function writeCache(storage, stories, now) {
  try {
    const store = resolveStorage(storage);
    if (!store || typeof store.setItem !== 'function') return false;
    if (!Array.isArray(stories) || stories.length === 0) return false;
    const savedAt = typeof now === 'number' ? now : (typeof now === 'function' ? now() : Date.now());
    store.setItem(CACHE_KEY, JSON.stringify({ version: 1, savedAt: savedAt, stories: stories }));
    return true;
  } catch (_) {
    return false;
  }
}

function syncError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function withCacheBuster(url, stamp) {
  const separator = url.indexOf('?') === -1 ? '?' : '&';
  return url + separator + 't=' + encodeURIComponent(String(stamp));
}

// Télécharge et valide les histoires distantes. Retourne Story[].
// Lève une Error (avec `code` : NO_FETCH, TIMEOUT, NETWORK, HTTP, JSON, EMPTY).
export async function fetchRemoteStories(options) {
  const opts = options || {};
  const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const url = opts.url || DATA_URL;
  const timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 ? opts.timeoutMs : FETCH_TIMEOUT_MS;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const setTimer = opts.setTimeoutImpl || setTimeout;
  const clearTimer = opts.clearTimeoutImpl || clearTimeout;

  if (typeof fetchImpl !== 'function') throw syncError('NO_FETCH', 'fetch indisponible dans cet environnement');

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const init = { cache: 'no-store', headers: { Accept: 'application/json' } };
  if (controller) init.signal = controller.signal;

  let timer = null;
  let timedOut = false;
  const timeout = new Promise(function (_, reject) {
    timer = setTimer(function () {
      timedOut = true;
      if (controller) {
        try { controller.abort(); } catch (_) { /* rien */ }
      }
      reject(syncError('TIMEOUT', 'Délai dépassé (' + Math.round(timeoutMs / 1000) + ' s) en contactant GitHub'));
    }, timeoutMs);
  });

  try {
    let response;
    try {
      // Promise.race garantit l'expiration même si fetchImpl ignore `signal`.
      response = await Promise.race([fetchImpl(withCacheBuster(url, now()), init), timeout]);
    } catch (err) {
      if (err && err.code === 'TIMEOUT') throw err;
      if (timedOut) throw syncError('TIMEOUT', 'Délai dépassé (' + Math.round(timeoutMs / 1000) + ' s) en contactant GitHub', err);
      throw syncError('NETWORK', 'Réseau indisponible : ' + (err && err.message ? err.message : String(err)), err);
    }

    if (!response || !response.ok) {
      const status = response && typeof response.status === 'number' ? response.status : 0;
      const hint = status === 404 ? ' (fichier ou dépôt introuvable, ou dépôt privé)' : '';
      const error = syncError('HTTP', 'Réponse HTTP ' + status + hint);
      error.status = status;
      throw error;
    }

    let data;
    try {
      if (typeof response.text === 'function') {
        const body = await Promise.race([response.text(), timeout]);
        data = JSON.parse(body);
      } else {
        data = await Promise.race([response.json(), timeout]);
      }
    } catch (err) {
      if (err && err.code === 'TIMEOUT') throw err;
      throw syncError('JSON', 'stories.json n\'est pas un JSON valide : ' + (err && err.message ? err.message : String(err)), err);
    }

    const result = validateStories(data);
    if (result.stories.length === 0) {
      const first = result.rejected[0];
      throw syncError('EMPTY', 'Aucune histoire valide dans stories.json' + (first ? ' (' + first.reason + ')' : ''));
    }
    return result.stories;
  } finally {
    if (timer !== null) clearTimer(timer);
    // Évite un rejet non géré de la promesse d'expiration.
    timeout.catch(function () {});
  }
}

// Crée le synchroniseur utilisé par le widget.
// Options : { dispatch, storage, fetchImpl, url, now, timeoutMs,
//             retryDelaysMs (défaut RETRY_DELAYS_MS, [] pour désactiver),
//             setTimeoutImpl, clearTimeoutImpl, initialStories }
// Retour : { syncNow(): Promise<void>, loadCached(): boolean, dispose(): void }
export function createSyncer(options) {
  const opts = options || {};
  const dispatch = typeof opts.dispatch === 'function' ? opts.dispatch : function () {};
  const storage = resolveStorage(opts.storage);
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const retryDelays = Array.isArray(opts.retryDelaysMs) ? opts.retryDelaysMs : RETRY_DELAYS_MS;
  const setTimer = opts.setTimeoutImpl || setTimeout;
  const clearTimer = opts.clearTimeoutImpl || clearTimeout;

  let fingerprint = null;
  let inFlight = null;
  let failures = 0;
  let retryTimer = null;
  let disposed = false;

  if (Array.isArray(opts.initialStories)) {
    const initial = validateStories(opts.initialStories).stories;
    if (initial.length > 0) fingerprint = JSON.stringify(initial);
  }

  function emit(event) {
    try { dispatch(event); } catch (_) { /* une erreur d'affichage ne doit pas casser la synchro */ }
  }

  function cancelRetry() {
    if (retryTimer !== null) {
      try { clearTimer(retryTimer); } catch (_) { /* rien */ }
      retryTimer = null;
    }
  }

  function scheduleRetry() {
    if (disposed || failures > retryDelays.length) return;
    const delay = retryDelays[failures - 1];
    if (typeof delay !== 'number' || delay <= 0) return;
    try {
      retryTimer = setTimer(function () {
        retryTimer = null;
        syncNow();
      }, delay);
    } catch (_) {
      retryTimer = null;
    }
  }

  function loadCached() {
    const cached = readCache(storage);
    if (!cached) return false;
    fingerprint = JSON.stringify(cached.stories);
    emit({ type: 'DATA', stories: cached.stories, source: 'cache', at: cached.savedAt !== null ? cached.savedAt : now() });
    return true;
  }

  async function run() {
    try {
      const stories = await fetchRemoteStories({
        fetchImpl: opts.fetchImpl,
        url: opts.url,
        timeoutMs: opts.timeoutMs,
        now: now,
      });
      const at = now();
      failures = 0;
      writeCache(storage, stories, at);
      const next = JSON.stringify(stories);
      if (next !== fingerprint) {
        fingerprint = next;
        emit({ type: 'DATA', stories: stories, source: 'remote', at: at });
      } else {
        emit({ type: 'SYNC_OK', at: at });
      }
    } catch (err) {
      failures += 1;
      const message = err && err.message ? err.message : String(err);
      emit({ type: 'SYNC_FAIL', error: message, code: (err && err.code) || 'UNKNOWN', at: now() });
      scheduleRetry();
    }
  }

  function syncNow() {
    if (inFlight) return inFlight;
    cancelRetry();
    inFlight = run().catch(function () {}).then(function () {
      inFlight = null;
    });
    return inFlight;
  }

  function dispose() {
    disposed = true;
    cancelRetry();
  }

  return { syncNow: syncNow, loadCached: loadCached, dispose: dispose };
}
