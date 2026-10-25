import localStories from './stories.json';

// Configure this only if you publish the repository under a different name.
const DATA_URL = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json';
const ROTATION_MS = 20 * 60 * 1000;
const STORAGE_KEY = 'mur-des-retournements-settings-v1';
const SIZES = [340, 440, 560];
let lastReceived = '';

export const refreshFrequency = 5 * 60 * 1000;
export const className = `
  position: absolute;
  top: 54px;
  right: 26px;
  width: auto;
  z-index: 2;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  color: #f9fafb;
  user-select: none;
  pointer-events: auto;
`;

export const initialState = {
  stories: localStories,
  index: 0,
  size: 1,
  paused: false,
  photos: {},
  lastSync: null,
  syncError: false,
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const wrap = (index, length) => ((index % length) + length) % length;
const safeStories = (data) => {
  if (!Array.isArray(data)) return null;
  const ids = new Set();
  const rows = data.filter(s => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || ids.has(s.id)) return false;
    if (!['name','lowest','comeback'].every(k => typeof s[k] === 'string' && s[k].trim())) return false;
    ids.add(s.id);
    return true;
  });
  return rows.length ? rows : null;
};

const fetchPhotos = (dispatch, data) => {
  const titles = [...new Set(data.map(s => s.wikipedia).filter(Boolean))];
  // Public encyclopedia page images only; no AI-generated faces.
  for (let start = 0; start < titles.length; start += 25) {
    const subset = titles.slice(start, start + 25);
    const qs = new URLSearchParams({ action: 'query', prop: 'pageimages', pithumbsize: '750',
      titles: subset.join('|'), format: 'json', origin: '*' });
    fetch(`https://en.wikipedia.org/w/api.php?${qs.toString()}`)
      .then(r => { if (!r.ok) throw new Error('image response'); return r.json(); })
      .then(payload => {
        const photos = {};
        const pages = payload && payload.query && payload.query.pages || {};
        Object.keys(pages).forEach(k => {
          const page = pages[k];
          if (page && page.thumbnail && page.thumbnail.source) photos[page.title] = page.thumbnail.source;
        });
        dispatch({ type: 'PHOTOS', photos });
      }).catch(() => {});
  }
};

export const init = (dispatch) => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    dispatch({type: 'RESTORE', settings: saved});
  } catch (_) {}
  fetchPhotos(dispatch, localStories);
  setInterval(() => dispatch({type: 'TICK'}), ROTATION_MS);
};

export const command = (dispatch) => {
  fetch(DATA_URL + '?v=' + Date.now(), {cache: 'no-store'})
    .then(response => { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
    .then(data => {
      const rows = safeStories(data);
      if (!rows) throw new Error('Données invalides');
      const fingerprint = JSON.stringify(rows);
      if (fingerprint !== lastReceived) {
        lastReceived = fingerprint;
        dispatch({type: 'DATA', stories: rows});
        fetchPhotos(dispatch, rows);
      } else {
        dispatch({type: 'SYNC_OK'});
      }
    })
    .catch(() => dispatch({type: 'SYNC_FAIL'}));
};

export const updateState = (event, previous) => {
  const state = previous || initialState;
  const stories = state.stories || localStories;
  const count = Math.max(1, stories.length);
  switch (event.type) {
    case 'RESTORE': return {
      ...state,
      size: clamp(Number.isInteger(event.settings.size) ? event.settings.size : 1, 0, 2),
      index: wrap(Number.isInteger(event.settings.index) ? event.settings.index : 0, count),
      paused: event.settings.paused === true,
    };
    case 'NEXT': return {...state, index: wrap(state.index + 1, count)};
    case 'PREV': return {...state, index: wrap(state.index - 1, count)};
    case 'TICK': return state.paused ? state : {...state, index: wrap(state.index + 1, count)};
    case 'SIZE': return {...state, size: clamp(event.size, 0, 2)};
    case 'PAUSE': return {...state, paused: !state.paused};
    case 'DATA': {
      const old = stories[state.index];
      const preserved = old ? event.stories.findIndex(s => s.id === old.id) : -1;
      return {...state, stories: event.stories, index: preserved >= 0 ? preserved : 0,
        lastSync: Date.now(), syncError: false};
    }
    case 'PHOTOS': return {...state, photos: {...state.photos, ...event.photos}};
    case 'SYNC_OK': return {...state, lastSync: Date.now(), syncError: false};
    case 'SYNC_FAIL': return {...state, syncError: true};
    default: return state;
  }
};

const remember = (state, event, dispatch) => {
  const count = Math.max(1, state.stories.length);
  let next = { index: state.index, size: state.size, paused: state.paused };
  if (event.type === 'NEXT') next.index = wrap(next.index + 1, count);
  if (event.type === 'PREV') next.index = wrap(next.index - 1, count);
  if (event.type === 'SIZE') next.size = clamp(event.size, 0, 2);
  if (event.type === 'PAUSE') next.paused = !next.paused;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
  dispatch(event);
};

const control = {
  appearance: 'none', border: '1px solid rgba(255,255,255,.20)',
  background: 'rgba(255,255,255,.11)', color: '#fff',
  borderRadius: 12, minWidth: 32, height: 32, fontSize: 18,
  cursor: 'pointer', padding: '0 8px', fontWeight: 600,
};

export const render = (state, dispatch) => {
  const stories = state.stories || localStories;
  const story = stories[wrap(state.index || 0, Math.max(1, stories.length))] || localStories[0];
  const width = SIZES[clamp(state.size || 0, 0, 2)];
  const compact = width < 400;
  const photo = story.image_url || state.photos[story.wikipedia] || '';
  const initials = story.name.split(' ').filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase();
  const action = (event) => remember(state, event, dispatch);
  const button = (label, title, onClick, active) => <button title={title} aria-label={title} onClick={onClick}
      style={{...control, background: active ? 'rgba(255,255,255,.28)' : control.background}}>{label}</button>;
  return <article style={{width, overflow: 'hidden', boxSizing: 'border-box', borderRadius: 26,
      color: '#ffffff', background: 'rgba(20,29,48,.89)',
      boxShadow: '0 18px 48px rgba(0,0,0,.30), inset 0 1px rgba(255,255,255,.18)',
      border: '1px solid rgba(255,255,255,.18)',
      WebkitBackdropFilter: 'blur(28px)', backdropFilter: 'blur(28px)'}}>
    <div style={{padding: compact ? '16px 17px 12px' : '20px 22px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10}}>
      <div style={{fontWeight: 760, fontSize: compact ? 12 : 13, letterSpacing: 1.6,
        textTransform: 'uppercase', color: '#b9cde5'}}>Le mur des retournements</div>
      <div style={{fontSize: 12, color: '#b8c6d7', flexShrink: 0}}>{wrap(state.index, stories.length)+1} / {stories.length}</div>
    </div>
    <div style={{height: compact ? 180 : width > 500 ? 300 : 238,
      background: 'linear-gradient(125deg,#263c5e,#1a2c45)', position:'relative', overflow:'hidden'}}>
      <div style={{display:'flex',height:'100%',alignItems:'center',justifyContent:'center',fontSize:72,
        fontWeight:800,color:'rgba(255,255,255,.28)'}}>{initials}</div>
      {photo && <img src={photo} alt={story.name} style={{position:'absolute',inset:0,width:'100%', height:'100%',
        objectFit:'cover',objectPosition:'center 28%'}}
        onError={(e)=>{ e.currentTarget.style.display='none'; }} />}
      <div style={{position:'absolute', inset:0,
        background:'linear-gradient(0deg,rgba(10,18,31,.98) 0%,transparent 60%)'}} />
      <div style={{position:'absolute',left:compact ? 17 : 22,bottom:16,right:15}}>
        <div style={{fontSize:12,letterSpacing:.5,color:'#c3d7f0',marginBottom:3}}>{story.category || ''}</div>
        <div style={{fontSize:compact ? 25 : 30,fontWeight:800,lineHeight:1.1,textShadow:'0 2px 14px #101a29'}}>{story.name}</div>
      </div>
    </div>
    <div style={{padding: compact ? '17px' : '21px 22px 18px'}}>
      <div style={{fontWeight:800,fontSize:10,letterSpacing:1.9,color:'#f6b0ad',marginBottom:7}}>AU PLUS BAS</div>
      <p style={{fontSize:compact ? 13 : 14, lineHeight:1.53, margin:'0 0 18px',color:'#f5f7fa'}}>{story.lowest}</p>
      <div style={{fontWeight:800,fontSize:10,letterSpacing:1.9,color:'#8fe0bd',marginBottom:7}}>LE RETOURNEMENT</div>
      <p style={{fontSize:compact ? 13 : 14,lineHeight:1.53,margin:'0 0 17px',color:'#f5f7fa'}}>{story.comeback}</p>
      {story.lesson && <div style={{borderTop:'1px solid rgba(255,255,255,.16)',paddingTop:11,
        fontStyle:'italic',fontSize:12,color:'#a9c1dd'}}>« {story.lesson} »</div>}
      {photo && <div style={{marginTop:9,fontSize:10,color:'#7f93ad'}}>
        Photo : {story.image_credit || 'Wikimedia / Wikipédia — vérifier la licence de l’image'}
      </div>}
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
      padding:'12px 16px',borderTop:'1px solid rgba(255,255,255,.10)',background:'rgba(0,0,0,.12)'}}>
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        {button('‹','Histoire précédente',()=>action({type:'PREV'}))}
        {button('›','Histoire suivante',()=>action({type:'NEXT'}))}
        {button(state.paused ? '▶' : 'Ⅱ',state.paused ? 'Reprendre la rotation' : 'Mettre en pause',()=>action({type:'PAUSE'}))}
      </div>
      <div style={{display:'flex',gap:4,alignItems:'center'}}>
        {['S','M','L'].map((v,i) => <button key={v} title={'Taille '+v} aria-label={'Taille '+v}
          style={{...control,minWidth:27,height:28,fontSize:11,padding:'0 6px',background:state.size===i?'rgba(255,255,255,.30)':control.background}}
          onClick={()=>action({type:'SIZE',size:i})}>{v}</button>)}
      </div>
    </div>
  </article>;
};
