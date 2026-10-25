// Le mur des retournements : widget Übersicht (macOS).
// Une personne à la fois : vraie photo, nom, épreuve, retournement.
//
// Données : https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json
// (lues toutes les 5 minutes par ./lib/sync.js, avec repli sur le cache puis
// sur ./stories.json embarqué). Les boutons ne répondent aux clics qu'avec le
// raccourci d'interaction d'Übersicht (Préférences > Interaction Shortcut) et
// l'autorisation Accessibilité accordée à Übersicht.

import localStories from './stories.json';
import {
  CARD_WIDTH, CARD_HEIGHT, ROTATION_MS, createInitialState, reducer, loadPrefs, savePrefs, photoCandidates, currentIndex,
} from './lib/state.js';
import { DATA_URL, SYNC_INTERVAL_MS, createSyncer } from './lib/sync.js';

// ---------------------------------------------------------------------------
// CONFIG : tout ce qui se personnalise sans toucher au reste du fichier.
// Enregistrez le fichier : Übersicht recharge le widget aussitôt.
// ---------------------------------------------------------------------------
const CONFIG = {
  // Position sur le bureau, en pixels. Indiquez au plus une valeur verticale
  // (top ou bottom) et une horizontale (left ou right) ; mettez les autres à null.
  position: { top: 54, right: 26, bottom: null, left: null },

  // Opacité du fond de la carte (0 = transparent, 1 = opaque). Le flou
  // d'arrière-plan reste actif quelle que soit la valeur.
  backgroundOpacity: 0.72,
  // Intensité du flou d'arrière-plan, en pixels.
  blur: 30,
  // Rayon des coins de la carte, en pixels.
  radius: 24,

  // Taille fixe de la carte en pixels (350 x 490 par défaut, CARD_WIDTH et
  // CARD_HEIGHT de lib/state.js). La largeur est réduite si l'écran est plus
  // étroit ; la hauteur ne varie jamais, seul le texte défile.
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  // Rotation automatique toutes les 20 minutes activée au premier lancement.
  // false : le widget démarre en pause (le bouton pause/reprise reste disponible).
  rotationEnabledByDefault: true,

  // Thème de couleurs. `background` est une couleur RVB « r, g, b » combinée à backgroundOpacity.
  theme: {
    background: '16, 22, 36',
    border: 'rgba(255, 255, 255, 0.16)',
    text: '#f5f7fa',
    muted: '#a9b8cc',
    title: '#c4d4ea',
    low: '#ff9f9a',        // « LOWEST POINT »
    high: '#7fdcb4',       // « TURNAROUND »
    at25: '#b9b8f2',       // « AT 25 »
    photoFallback: 'linear-gradient(135deg, #2b4266 0%, #1a2a44 100%)',
    button: 'rgba(255, 255, 255, 0.10)',
    buttonActive: 'rgba(255, 255, 255, 0.30)',
    buttonBorder: 'rgba(255, 255, 255, 0.18)',
    syncOk: '#34c759',
    syncWarn: '#ff9f0a',
    syncIdle: '#8e8e93',
  },

  // Typographie et espacements (tailles de police, hauteur de photo, marges, boutons), en pixels.
  layout: { name: 21, category: 10.5, headline: 11.5, body: 12, eyebrow: 9, photo: 172, pad: 14, gap: 11, button: 26 },
};

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const DISPLAY_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const TIMER_KEY = '__murDesRetournementsTimer';

// ---------------------------------------------------------------------------
// Exports Übersicht
// ---------------------------------------------------------------------------
export const refreshFrequency = SYNC_INTERVAL_MS;

const px = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v}px` : null);
const positionCss = ['top', 'right', 'bottom', 'left']
  .map((k) => (px(CONFIG.position[k]) ? `${k}: ${px(CONFIG.position[k])};` : ''))
  .join('\n  ');

export const className = `
  position: absolute;
  ${positionCss}
  z-index: 2;
  font-family: ${FONT};
  color: ${CONFIG.theme.text};
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;

  /* Barre de défilement discrète de la zone de texte. */
  [data-role="content"]::-webkit-scrollbar { width: 4px; }
  [data-role="content"]::-webkit-scrollbar-track { background: transparent; }
  [data-role="content"]::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.22); border-radius: 4px; }
`;

export const initialState = {
  ...createInitialState(localStories, Date.now()),
  paused: !CONFIG.rotationEnabledByDefault,
};

// ---------------------------------------------------------------------------
// Effets de bord (hors réducteur, qui reste pur)
// ---------------------------------------------------------------------------
const getStorage = () => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (_) { return null; }
};

// Übersicht transmet la même fonction dispatch à init, command et render ;
// on garde la plus récente pour le syncer, créé une seule fois.
let latestDispatch = null;
let syncer = null;
const wikiRequested = new Set();

const fetchWikiPhotos = (stories) => {
  if (!latestDispatch || typeof fetch !== 'function') return;
  const titles = [...new Set((stories || []).map((s) => s && s.wikipedia).filter((t) => typeof t === 'string' && t))]
    .filter((t) => !wikiRequested.has(t));
  titles.forEach((t) => wikiRequested.add(t));
  // Vignettes des pages Wikipédia (photographies publiques), jamais d'image générée.
  for (let start = 0; start < titles.length; start += 25) {
    const subset = titles.slice(start, start + 25);
    const qs = new URLSearchParams({
      action: 'query', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '800',
      titles: subset.join('|'), redirects: '1', format: 'json', origin: '*',
    });
    fetch(`${WIKI_API}?${qs.toString()}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((payload) => {
        const q = (payload && payload.query) || {};
        // Retrouver le titre demandé à partir du titre normalisé ou redirigé.
        const back = {};
        [...(q.normalized || []), ...(q.redirects || [])].forEach(({ from, to }) => {
          (back[to] = back[to] || []).push(...(back[from] || [from]));
        });
        const photos = {};
        Object.values(q.pages || {}).forEach((page) => {
          const src = page && page.thumbnail && page.thumbnail.source;
          if (!src) return;
          [page.title, ...(back[page.title] || [])].forEach((t) => { photos[t] = src; });
        });
        if (Object.keys(photos).length) latestDispatch({ type: 'PHOTOS', photos });
      })
      .catch(() => { subset.forEach((t) => wikiRequested.delete(t)); });
  }
};

const dispatchFromSync = (event) => {
  if (!latestDispatch) return;
  latestDispatch(event);
  if (event && event.type === 'DATA') fetchWikiPhotos(event.stories);
};

const ensureSyncer = (dispatch) => {
  latestDispatch = dispatch;
  if (!syncer) {
    syncer = createSyncer({
      dispatch: dispatchFromSync,
      storage: getStorage(),
      fetchImpl: typeof fetch === 'function' ? fetch.bind(typeof window !== 'undefined' ? window : undefined) : undefined,
      url: DATA_URL,
      now: () => Date.now(),
    });
  }
  return syncer;
};

// Garde-fou : une seule minuterie de rotation, même si init est rappelé ou si
// Übersicht recharge le module (la référence est aussi gardée sur window).
let rotationTimer = null;
const startRotationTimer = () => {
  const host = typeof window !== 'undefined' ? window : null;
  if (rotationTimer) clearInterval(rotationTimer);
  if (host && host[TIMER_KEY]) clearInterval(host[TIMER_KEY]);
  // Vérification chaque minute ; le réducteur n'avance qu'au bout de ROTATION_MS.
  rotationTimer = setInterval(() => {
    if (latestDispatch) latestDispatch({ type: 'TICK', now: Date.now() });
  }, Math.min(60 * 1000, ROTATION_MS));
  if (host) host[TIMER_KEY] = rotationTimer;
};

export const init = (dispatch) => {
  const s = ensureSyncer(dispatch);
  // Préférences lues AVANT le cache : le DATA du cache ne doit pas les écraser.
  const prefs = loadPrefs(getStorage(), { paused: !CONFIG.rotationEnabledByDefault });
  try { s.loadCached(); } catch (_) { /* cache illisible : on garde les données embarquées */ }
  dispatch({ type: 'RESTORE', prefs, now: Date.now() });
  prefsRestored = true;
  fetchWikiPhotos(localStories);
  startRotationTimer();
};

export const command = (dispatch) => {
  const s = ensureSyncer(dispatch);
  return Promise.resolve().then(() => s.syncNow()).catch(() => {});
};

// Événements après lesquels la personne courante ou la pause peuvent changer :
// on enregistre alors les préférences.
let prefsRestored = false;
const PERSISTED = new Set(['NEXT', 'PREV', 'TICK', 'TOGGLE_PAUSE', 'DATA']);

export const updateState = (event, previousState) => {
  const next = reducer(previousState || initialState, event);
  if (event && event.type === 'RESTORE') prefsRestored = true;
  if (prefsRestored && event && PERSISTED.has(event.type) && next !== previousState) savePrefs(getStorage(), next);
  return next;
};

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
// Couleur d'étiquette de « AT 25 » (lavande sobre), remplaçable par CONFIG.theme.at25.
const AT25_COLOR = '#b9b8f2';

// Largeur de la carte : CONFIG.width, réduite si l'écran (moins les marges
// horizontales de CONFIG.position) est plus étroit. Recalculée à chaque rendu.
const MIN_WIDTH = 200;
const cardWidth = () => {
  const target = px(CONFIG.width) ? CONFIG.width : CARD_WIDTH;
  let screen = null;
  try { screen = typeof window !== 'undefined' ? window.innerWidth : null; } catch (_) { screen = null; }
  if (typeof screen !== 'number' || !Number.isFinite(screen) || screen <= 0) return target;
  // Côté sans ancrage : marge par défaut de 16 px pour ne pas coller au bord.
  const margin = (k) => (px(CONFIG.position[k]) ? Math.max(0, CONFIG.position[k]) : 16);
  return Math.round(Math.max(MIN_WIDTH, Math.min(target, screen - margin('left') - margin('right'))));
};

// Les textes affichés n'utilisent ni tiret cadratin ni demi-cadratin.
const clean = (t) => (typeof t === 'string' ? t.replace(/\s*[\u2014\u2013]\s*/g, ', ').trim() : '');

const initialsOf = (name) => {
  const words = clean(name).split(/\s+/).filter((w) => /^[\p{L}]/u.test(w));
  if (!words.length) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
};

// URL de photo ayant déjà échoué (portée module, pas dans l'état) : le rendu
// choisit le premier candidat non encore en échec.
const failedPhotos = new Set();

const onPhotoError = (e) => {
  const img = e.currentTarget;
  let list = [];
  try { list = JSON.parse(img.getAttribute('data-candidates') || '[]'); } catch (_) { list = []; }
  const current = img.getAttribute('data-src');
  if (current) failedPhotos.add(current);
  const next = list.find((u) => !failedPhotos.has(u));
  if (next) {
    img.setAttribute('data-src', next);
    img.setAttribute('data-candidate', String(list.indexOf(next)));
    img.src = next;
  } else {
    img.setAttribute('data-candidate', 'initiales');
    img.style.display = 'none';
  }
};

const Icon = ({ kind, size }) => {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' };
  if (kind === 'prev') return <svg {...common}><path d="M15 5l-7 7 7 7" /></svg>;
  if (kind === 'next') return <svg {...common}><path d="M9 5l7 7-7 7" /></svg>;
  if (kind === 'pause') return <svg {...common}><path d="M9 5v14M15 5v14" /></svg>;
  return <svg {...common} fill="currentColor" strokeWidth={1.6}><path d="M8 5.5v13l10.5-6.5z" /></svg>;
};

const syncInfo = (state) => {
  const time = (t) => {
    try { return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
  };
  // Textes visibles en anglais (le détail technique de l'erreur, en français
  // dans lib/sync.js, n'est pas affiché).
  if (state.syncError) {
    const shown = state.source === 'cache' ? 'cached copy' : state.source === 'remote' ? 'last data received' : 'built-in stories';
    return { color: CONFIG.theme.syncWarn, label: 'offline',
      title: `Sync failed: GitHub could not be reached. Showing: ${shown}.` +
        (state.lastSync ? ` Last sync at ${time(state.lastSync)}.` : '') };
  }
  if (state.lastSync) {
    return { color: CONFIG.theme.syncOk, label: '',
      title: `Synced with GitHub at ${time(state.lastSync)} (checked every 5 minutes).` };
  }
  return { color: CONFIG.theme.syncIdle, label: '', title: 'Waiting for first sync: showing built-in stories.' };
};

export const render = (state, dispatch) => {
  const T = CONFIG.theme;
  const stories = (state && state.stories && state.stories.length) ? state.stories : localStories;
  const L = CONFIG.layout;
  const width = cardWidth();
  const index = currentIndex({ ...state, stories });
  const story = stories[index];
  if (!story) return <div />;

  const send = (event) => { if (typeof dispatch === 'function') dispatch(event); };
  const candidates = photoCandidates(story, (state && state.photos) || {});
  const photo = candidates.find((u) => !failedPhotos.has(u));
  // Sections du corps, dans l'ordre ; « AT 25 » n'existe que si at25 est renseigné.
  const sections = [
    { key: 'low', label: 'LOWEST POINT', color: T.low, text: clean(story.lowest) },
    { key: 'high', label: 'TURNAROUND', color: T.high, text: clean(story.comeback) },
    { key: 'at25', label: 'AT 25', color: T.at25 || AT25_COLOR, text: clean(story.at25) },
  ].filter((sec) => sec.text);
  const sync = syncInfo(state || {});
  const paused = !!(state && state.paused);

  const wrapText = { overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'auto', WebkitHyphens: 'auto' };
  const button = (label, onClick, content, extra = {}, key = label) => (
    <button key={key} type="button" title={label} aria-label={label} onClick={onClick}
      style={{
        appearance: 'none', WebkitAppearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: L.button, height: L.button, padding: '0 7px', borderRadius: L.button / 2.4,
        border: `1px solid ${T.buttonBorder}`, background: T.button, color: T.text, cursor: 'pointer',
        fontFamily: FONT, fontSize: 11, fontWeight: 650, letterSpacing: 0.3, lineHeight: 1, ...extra,
      }}>{content}</button>
  );

  return (
    <article lang="en" aria-label="Success stories" style={{
      width, height: CONFIG.height, boxSizing: 'border-box', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      borderRadius: CONFIG.radius, border: `1px solid ${T.border}`,
      background: `rgba(${T.background}, ${CONFIG.backgroundOpacity})`,
      backdropFilter: `blur(${CONFIG.blur}px) saturate(160%)`, WebkitBackdropFilter: `blur(${CONFIG.blur}px) saturate(160%)`,
      boxShadow: '0 22px 50px rgba(0, 0, 0, 0.34), 0 2px 8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    }}>
      <div style={{ position: 'relative', flex: 'none', height: L.photo, overflow: 'hidden', background: T.photoFallback }}>
        <div title={sync.title} aria-label={sync.title} style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', borderRadius: 99,
          background: 'rgba(16, 22, 36, 0.62)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          fontSize: L.eyebrow + 1, color: T.text, fontVariantNumeric: 'tabular-nums',
        }}>
          {sync.label && <span style={{ color: sync.color, fontWeight: 600 }}>{sync.label}</span>}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sync.color,
            boxShadow: `0 0 0 3px ${sync.color}33` }} />
          <span>{index + 1} / {stories.length}</span>
        </div>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', paddingBottom: L.photo * 0.24, fontFamily: DISPLAY_FONT, fontSize: L.photo * 0.3, fontWeight: 700,
          letterSpacing: 2, color: 'rgba(255, 255, 255, 0.30)' }}>{initialsOf(story.name)}</div>
        {photo && <img key={story.id} src={photo} alt={`Portrait of ${clean(story.name)}`}
          data-src={photo} data-candidate={String(candidates.indexOf(photo))}
          data-candidates={JSON.stringify(candidates)} onError={onPhotoError}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: 'center 25%' }} />}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `linear-gradient(0deg, rgba(${T.background}, 0.96) 0%, rgba(${T.background}, 0.55) 32%, rgba(${T.background}, 0) 62%)` }} />
        <div style={{ position: 'absolute', left: L.pad, right: L.pad, bottom: 11 }}>
          {story.category && <div style={{ fontSize: L.category, fontWeight: 600, letterSpacing: 0.4, color: T.title,
            marginBottom: 3, textShadow: '0 1px 8px rgba(0, 0, 0, 0.5)', ...wrapText }}>{clean(story.category)}</div>}
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: L.name, fontWeight: 760, lineHeight: 1.08,
            letterSpacing: -0.3, textShadow: '0 2px 16px rgba(0, 0, 0, 0.55)', ...wrapText }}>{clean(story.name)}</div>
          {clean(story.headline) && <div data-role="headline" style={{ fontSize: L.headline, fontWeight: 600, lineHeight: 1.3,
            marginTop: 3, color: T.text, opacity: 0.9, textShadow: '0 1px 10px rgba(0, 0, 0, 0.6)', ...wrapText }}>{clean(story.headline)}</div>}
        </div>
      </div>

      {/* Seule cette zone défile ; key = id : retour en haut à chaque changement de personne. */}
      <div key={`content-${story.id}`} data-role="content" style={{
        flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: `${L.pad * 0.85}px ${L.pad}px ${L.pad * 0.85}px`, boxSizing: 'border-box' }}>
        {sections.map((sec, i) => (
          <section key={sec.key} data-role={sec.key} style={{ marginBottom: i < sections.length - 1 ? L.gap : 0 }}>
            <div style={{ fontSize: L.eyebrow, fontWeight: 800, letterSpacing: 1.6, color: sec.color, marginBottom: 4 }}>{sec.label}</div>
            <p style={{ fontSize: L.body, lineHeight: 1.45, margin: 0, color: T.text, ...wrapText }}>{sec.text}</p>
          </section>
        ))}
      </div>

      <nav aria-label="Widget controls" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '8px 12px', borderTop: `1px solid ${T.border}`,
        background: 'rgba(0, 0, 0, 0.14)' }}>
        {button('Previous person', () => send({ type: 'PREV', now: Date.now() }), <Icon kind="prev" size={L.button * 0.5} />)}
        {button('Next person', () => send({ type: 'NEXT', now: Date.now() }), <Icon kind="next" size={L.button * 0.5} />)}
        {button(paused ? 'Resume automatic rotation (every 20 minutes)' : 'Pause automatic rotation',
          () => send({ type: 'TOGGLE_PAUSE', now: Date.now() }),
          <Icon kind={paused ? 'play' : 'pause'} size={L.button * 0.46} />,
          paused ? { background: T.buttonActive } : {})}
      </nav>
    </article>
  );
};
