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
  SIZES, ROTATION_MS, createInitialState, reducer, loadPrefs, savePrefs, photoCandidates, currentIndex,
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

  // Taille utilisée tant qu'aucune préférence n'est enregistrée : 0 = S, 1 = M, 2 = L.
  defaultSize: 1,
  // Largeurs S, M, L en pixels (par défaut celles de lib/state.js : 320, 420, 540).
  widths: SIZES.map((s) => s.width),
  // Rotation automatique toutes les 20 minutes activée au premier lancement.
  // false : le widget démarre en pause (le bouton pause/reprise reste disponible).
  rotationEnabledByDefault: true,

  // Thème de couleurs. `background` est une couleur RVB « r, g, b » combinée à backgroundOpacity.
  theme: {
    background: '16, 22, 36',
    border: 'rgba(255, 255, 255, 0.16)',
    text: '#f5f7fa',
    muted: '#a9b8cc',
    faint: '#7d8ca3',
    title: '#c4d4ea',
    low: '#ff9f9a',        // « AU PLUS BAS »
    high: '#7fdcb4',       // « LE RETOURNEMENT »
    lesson: '#c9d8ee',
    photoFallback: 'linear-gradient(135deg, #2b4266 0%, #1a2a44 100%)',
    button: 'rgba(255, 255, 255, 0.10)',
    buttonActive: 'rgba(255, 255, 255, 0.30)',
    buttonBorder: 'rgba(255, 255, 255, 0.18)',
    syncOk: '#34c759',
    syncWarn: '#ff9f0a',
    syncIdle: '#8e8e93',
  },

  // Typographie et espacements par taille (S, M, L).
  layouts: [
    { name: 21, category: 11, body: 12.5, eyebrow: 9.5, lesson: 11.5, photo: 168, pad: 16, gap: 13, button: 28 },
    { name: 27, category: 12, body: 13.5, eyebrow: 10, lesson: 12.5, photo: 230, pad: 20, gap: 16, button: 30 },
    { name: 33, category: 13, body: 15, eyebrow: 10.5, lesson: 13.5, photo: 300, pad: 24, gap: 19, button: 32 },
  ],
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
`;

export const initialState = {
  ...createInitialState(localStories, Date.now()),
  size: CONFIG.defaultSize,
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
  const prefs = loadPrefs(getStorage(), {
    size: CONFIG.defaultSize,
    paused: !CONFIG.rotationEnabledByDefault,
  });
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

// Événements après lesquels la personne courante, la taille ou la pause
// peuvent changer : on enregistre alors les préférences.
let prefsRestored = false;
const PERSISTED = new Set(['NEXT', 'PREV', 'TICK', 'SIZE', 'TOGGLE_PAUSE', 'DATA']);

export const updateState = (event, previousState) => {
  const next = reducer(previousState || initialState, event);
  if (event && event.type === 'RESTORE') prefsRestored = true;
  if (prefsRestored && event && PERSISTED.has(event.type) && next !== previousState) savePrefs(getStorage(), next);
  return next;
};

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
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
    const card = typeof img.closest === 'function' ? img.closest('article') : null;
    const credit = card && card.querySelector('[data-role="credit"]');
    if (credit) credit.style.display = 'none';
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
    try { return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
  };
  if (state.syncError) {
    const shown = state.source === 'cache' ? 'copie en cache' : state.source === 'remote' ? 'dernières données reçues' : 'données embarquées';
    return { color: CONFIG.theme.syncWarn, label: 'hors connexion',
      title: `Synchronisation impossible (${clean(state.syncError)}). Affichage : ${shown}.` +
        (state.lastSync ? ` Dernière synchronisation à ${time(state.lastSync)}.` : '') };
  }
  if (state.lastSync) {
    return { color: CONFIG.theme.syncOk, label: '',
      title: `Synchronisé avec GitHub à ${time(state.lastSync)} (vérification toutes les 5 minutes).` };
  }
  return { color: CONFIG.theme.syncIdle, label: '', title: 'Synchronisation en attente : affichage des données embarquées.' };
};

export const render = (state, dispatch) => {
  const T = CONFIG.theme;
  const stories = (state && state.stories && state.stories.length) ? state.stories : localStories;
  const sizeIndex = Number.isInteger(state && state.size) ? Math.max(0, Math.min(2, state.size)) : 1;
  const L = CONFIG.layouts[sizeIndex] || CONFIG.layouts[1];
  const width = CONFIG.widths[sizeIndex] || SIZES[sizeIndex].width;
  const index = currentIndex({ ...state, stories });
  const story = stories[index];
  if (!story) return <div />;

  const send = (event) => { if (typeof dispatch === 'function') dispatch(event); };
  const candidates = photoCandidates(story, (state && state.photos) || {});
  const photo = candidates.find((u) => !failedPhotos.has(u));
  const credit = clean(story.image_credit) || 'Wikimedia Commons';
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
    <article lang="fr" aria-label="Le mur des retournements" style={{
      width, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', overflow: 'hidden',
      borderRadius: CONFIG.radius, border: `1px solid ${T.border}`,
      background: `rgba(${T.background}, ${CONFIG.backgroundOpacity})`,
      backdropFilter: `blur(${CONFIG.blur}px) saturate(160%)`, WebkitBackdropFilter: `blur(${CONFIG.blur}px) saturate(160%)`,
      boxShadow: '0 22px 50px rgba(0, 0, 0, 0.34), 0 2px 8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    }}>
      <div style={{ position: 'relative', height: L.photo, overflow: 'hidden', background: T.photoFallback }}>
        <div title={sync.title} aria-label={sync.title} style={{
          position: 'absolute', top: L.pad * 0.55, right: L.pad * 0.65, zIndex: 2,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 9px', borderRadius: 99,
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
        {photo && <img key={story.id} src={photo} alt={`Portrait de ${clean(story.name)}`}
          data-src={photo} data-candidate={String(candidates.indexOf(photo))}
          data-candidates={JSON.stringify(candidates)} onError={onPhotoError}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: 'center 25%' }} />}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `linear-gradient(0deg, rgba(${T.background}, 0.96) 0%, rgba(${T.background}, 0.55) 32%, rgba(${T.background}, 0) 62%)` }} />
        <div style={{ position: 'absolute', left: L.pad, right: L.pad, bottom: L.pad * 0.8 }}>
          {story.category && <div style={{ fontSize: L.category, fontWeight: 600, letterSpacing: 0.4, color: T.title,
            marginBottom: 4, textShadow: '0 1px 8px rgba(0, 0, 0, 0.5)', ...wrapText }}>{clean(story.category)}</div>}
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: L.name, fontWeight: 760, lineHeight: 1.08,
            letterSpacing: -0.3, textShadow: '0 2px 16px rgba(0, 0, 0, 0.55)', ...wrapText }}>{clean(story.name)}</div>
        </div>
      </div>

      <div style={{ padding: `${L.pad * 0.9}px ${L.pad}px ${L.pad * 0.8}px` }}>
        <div style={{ fontSize: L.eyebrow, fontWeight: 800, letterSpacing: 1.8, color: T.low, marginBottom: 6 }}>AU PLUS BAS</div>
        <p style={{ fontSize: L.body, lineHeight: 1.5, margin: `0 0 ${L.gap}px`, color: T.text, ...wrapText }}>{clean(story.lowest)}</p>
        <div style={{ fontSize: L.eyebrow, fontWeight: 800, letterSpacing: 1.8, color: T.high, marginBottom: 6 }}>LE RETOURNEMENT</div>
        <p style={{ fontSize: L.body, lineHeight: 1.5, margin: 0, color: T.text, ...wrapText }}>{clean(story.comeback)}</p>
        {story.lesson && <div style={{ marginTop: L.gap, paddingTop: L.gap * 0.75, borderTop: `1px solid ${T.border}`,
          fontSize: L.lesson, lineHeight: 1.45, fontStyle: 'italic', color: T.lesson, ...wrapText }}>« {clean(story.lesson)} »</div>}
        {photo && <div data-role="credit" style={{ marginTop: L.gap * 0.7, fontSize: 9.5, lineHeight: 1.35,
          color: T.faint, ...wrapText }}>Photo : {credit}</div>}
      </div>

      <nav aria-label="Commandes du widget" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, padding: `${L.pad * 0.55}px ${L.pad * 0.8}px`, borderTop: `1px solid ${T.border}`,
        background: 'rgba(0, 0, 0, 0.14)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {button('Personne précédente', () => send({ type: 'PREV', now: Date.now() }), <Icon kind="prev" size={L.button * 0.5} />)}
          {button('Personne suivante', () => send({ type: 'NEXT', now: Date.now() }), <Icon kind="next" size={L.button * 0.5} />)}
          {button(paused ? 'Reprendre la rotation automatique (toutes les 20 minutes)' : 'Mettre la rotation automatique en pause',
            () => send({ type: 'TOGGLE_PAUSE', now: Date.now() }),
            <Icon kind={paused ? 'play' : 'pause'} size={L.button * 0.46} />,
            paused ? { background: T.buttonActive } : {})}
        </div>
        <div role="group" aria-label="Taille du widget" style={{ display: 'flex', gap: 4 }}>
          {SIZES.map((s, i) => button(`Taille ${s.key === 'S' ? 'petite' : s.key === 'M' ? 'moyenne' : 'grande'} (${s.key})`,
            () => send({ type: 'SIZE', size: i }), s.key,
            { minWidth: L.button - 2, height: L.button - 2, background: sizeIndex === i ? T.buttonActive : T.button }, s.key))}
        </div>
      </nav>
    </article>
  );
};
