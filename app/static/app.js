'use strict';
/* Bierstudio 3 – Frontend ohne Build-Schritt.
   Klicks laufen über data-act → ACT.name(el), Eingaben über data-on / data-change (CSP-tauglich, keine Inline-Handler).
   Navigation über den Hash (#/biere, #/bier/<id>, #/person/<name>, #/tasting/<id> …), damit Zurück überall funktioniert. */

// ------------------------------------------------------------------ Grundlagen
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } },
};
const VERSION = '3.0.0';
const CATS = ['Aussehen', 'Geruch', 'Geschmack', 'Körper', 'Abgang'];
const W = { Aussehen: 1, Geruch: 1, Geschmack: 2, 'Körper': 1, Abgang: 1 };
const TAGS = ['süffig', 'herb', 'bitter', 'malzig', 'süß', 'fruchtig', 'hopfig', 'spritzig', 'mild', 'würzig', 'vollmundig', 'wässrig', 'säuerlich', 'rauchig'];
const STYLES = ['Pils', 'Helles', 'Lager', 'Export', 'Weizen', 'Kellerbier', 'Märzen', 'Dunkel', 'Bock', 'Kölsch', 'Alt', 'IPA', 'Pale Ale', 'Stout', 'Porter', 'Radler', 'Alkoholfrei'];
const SRC = { katalog: 'Bierstudio-Katalog', wikidata: 'Wikidata', off: 'Open Food Facts' };

let D = LS.get('bs-cache', null);
let me = LS.get('bs-user', '');
let outbox = LS.get('bs-outbox', []);
let online = navigator.onLine;
let pendingRender = false, deferredInstall = null, scanStream = null, lastRouteKey = null, pendingNav = null;
let beerList = { q: '', f: 'all', sort: 'recent' }, personSort = 'recent', tastingSeg = 'rate';
const pick = {}, lastCurrent = {}, forms = {}, scrollPos = {};
const drafts = LS.get('bs-drafts', {});
const ACT = {}, ON = {}, CH = {};

const theme = LS.get('bs-theme', '');
if (theme) document.documentElement.dataset.theme = theme;

// ------------------------------------------------------------------ Format-Helfer
const fmt = (v, d = 1) => v == null || isNaN(v) ? '–' : (+v).toLocaleString('de-DE', { minimumFractionDigits: d === 1 ? 1 : 0, maximumFractionDigits: d });
const hue = str => { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
/** Personen und Bier-Kacheln: helle Tönungen der Palette mit dunkler Schrift derselben Farbe (flach, kein Verlauf). */
const TONES = [['#DCEBE2', '#3F6B57'], ['#F7DDD4', '#A9472F'], ['#FAEBD0', '#7E5512'], ['#DCDDE7', '#3D405B'], ['#D5E3E4', '#35566A']];
const toneOf = str => TONES[hue(str) % TONES.length];
const tone = str => toneOf(str)[0];
const toneInk = str => toneOf(str)[1];
const toneDot = str => toneOf(str)[1];
/** Noten in drei Stufen: Sage ab 7, Sunset ab 5, darunter Terra Cotta. */
const band = v => { v = Math.round(v * 10) / 10; return v >= 7 ? 'hi' : v >= 5 ? 'mid' : 'lo'; };
const scoreBg = v => v == null ? '' : `var(--s-${band(v)})`;
const scoreFg = v => v == null ? 'var(--faint)' : `var(--t-${band(v)})`;
const score = (v, small) => `<span class="score ${v == null ? 'empty' : 's-' + band(v)}">${fmt(v, 1)}</span>${small ? `<small>${small}</small>` : ''}`;
const scoreCol = (v, small) => `<span class="score-col">${score(v, small)}</span>`;
const initials = n => String(n).trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() || '?';
const avatar = (name, cls = '') => `<span class="av ${cls}" style="background:${tone(name)};color:${toneInk(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = v => Math.max(0, Math.min(10, v));
const hex16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { } };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const dateDe = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function ago(ts) {
  if (!ts) return '';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (isNaN(s)) return '';
  if (s < 90) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'gestern';
  if (d < 7) return `vor ${d} Tagen`;
  return dateDe(ts);
}
function verdict(v) {
  if (v == null) return 'Zieh den Regler';
  return v < 2 ? 'Weg damit' : v < 4 ? 'Eher nicht' : v < 5.5 ? 'Geht so' : v < 7 ? 'Ordentlich' : v < 8.5 ? 'Richtig gut' : v < 9.5 ? 'Hervorragend' : 'Perfekt';
}
const ICON = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/></svg>',
  glass: '<svg viewBox="0 0 24 24"><path d="M6 6h9v12.5A1.5 1.5 0 0 1 13.5 20h-6A1.5 1.5 0 0 1 6 18.5z"/><path d="M15 9h1.5a2.5 2.5 0 0 1 0 5H15M6 6c0-1.7 1.3-2.5 2.5-2 .7-1 2.6-1.3 3.6-.2 1.4-.4 2.9.6 2.9 2.2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.4c2.3-.3 4.2 1.2 4.7 3.9"/></svg>',
  cheers: '<svg viewBox="0 0 24 24"><path d="M5 4h5l-.6 7.2A2 2 0 0 1 7.4 13h-.3a2 2 0 0 1-2-1.8zM14 4h5l-.6 7.2a2 2 0 0 1-2 1.8h-.3a2 2 0 0 1-2-1.8zM7.3 13v6M16.7 13v6M5 19.5h4.6M14.4 19.5H19"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2L9 5h6l1.3 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6"/></svg>',
};

// ------------------------------------------------------------------ Toast & Rückfragen
let toastTimer, toastAction = null;
function toast(t, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(t)}</span>` + (action ? `<button class="toast-act" data-act="toastAct">${esc(action.label)}</button>` : '');
  el.classList.add('show');
  toastAction = action?.run || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); toastAction = null; }, action ? 7000 : 2600);
}
ACT.toastAct = async () => { const f = toastAction; toastAction = null; $('#toast').classList.remove('show'); if (f) await f(); };
const undoToast = (msg, tid) => toast(msg, tid ? { label: 'Rückgängig', run: () => restoreTrash(tid) } : null);
async function restoreTrash(tid) {
  try { await send('trash/restore', { tid }); haptic(20); toast('Wiederhergestellt'); } catch (e) { toast(e.message); }
}
ACT.restoreTrash = el => restoreTrash(el.dataset.tid);

/** Eigener Dialog statt confirm()/prompt(). */
function ask({ title, text = '', ok = 'OK', danger = false, input = null, cancel = 'Abbrechen' }) {
  return new Promise(res => {
    const d = $('#ask');
    $('#ask-body').innerHTML = `<h2>${esc(title)}</h2>${text ? `<p class="muted small">${esc(text)}</p>` : ''}${input ? `<input class="field" id="ask-in" value="${esc(input.value ?? '')}" placeholder="${esc(input.placeholder || '')}" inputmode="${input.mode || 'text'}" maxlength="${input.max || 60}" autocomplete="off" style="margin-top:12px">` : ''}<div class="btns"><button class="btn" id="ask-no">${esc(cancel)}</button><button class="btn ${danger ? 'danger-fill' : 'primary'}" id="ask-ok">${esc(ok)}</button></div>`;
    let done = false;
    const fin = v => { if (done) return; done = true; if (d.open) d.close(); res(v); };
    $('#ask-no').onclick = () => fin(input ? null : false);
    $('#ask-ok').onclick = () => fin(input ? $('#ask-in').value : true);
    d.onclose = () => fin(input ? null : false);
    d.onkeydown = e => { if (e.key === 'Enter' && input) { e.preventDefault(); $('#ask-ok').click(); } };
    d.showModal();
    if (input) setTimeout(() => { $('#ask-in').focus(); $('#ask-in').select(); }, 60);
  });
}

// ------------------------------------------------------------------ Daten-Helfer
const beer = id => D.beers.find(b => b.id === id);
const sessionOf = id => D?.sessions.find(s => s.id === id) || null;
const visible = r => !r.hidden;
const ctxEq = (a, b) => (a || null) === (b || null);
const shown = b => b && !b.blind;
const own = (s, b) => D.ratings.find(r => r.beer === b && r.user === me && ctxEq(r.session, s));
const people = () => [...new Set([...D.people, ...D.ratings.map(r => r.user)])];
/** Sichtbare Bewertungen zu Bieren, deren Namen man kennt. */
const knownRatings = () => D.ratings.filter(r => visible(r) && shown(beer(r.beer)));
function label(b, s) {
  if (!b) return 'Unbekannt';
  if (!b.blind) return b.name;
  const i = s ? s.beers.indexOf(b.id) : -1;
  return i >= 0 ? `Bier ${i + 1}` : 'Verdecktes Bier';
}
const COUNTRIES = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', CZ: 'Tschechien', BE: 'Belgien', NL: 'Niederlande', DK: 'Dänemark', PL: 'Polen', FR: 'Frankreich', IT: 'Italien', ES: 'Spanien', PT: 'Portugal', GB: 'Großbritannien', IE: 'Irland', US: 'USA', MX: 'Mexiko', JP: 'Japan', CN: 'China', TH: 'Thailand', AU: 'Australien', SE: 'Schweden', NO: 'Norwegen', FI: 'Finnland', HU: 'Ungarn', HR: 'Kroatien', GR: 'Griechenland', TR: 'Türkei' };
const countryCode = c => { if (!c) return ''; if (COUNTRIES[c]) return c; const hit = Object.entries(COUNTRIES).find(([, n]) => n === c || (c === 'Vereinigte Staaten' && n === 'USA') || (c === 'Vereinigtes Königreich' && n === 'Großbritannien')); return hit ? hit[0] : c; };
const flag = c => /^[A-Z]{2}$/.test(c || '') ? String.fromCodePoint(...[...c].map(x => 0x1F1A5 + x.charCodeAt(0))) : '';
const countryText = c => flag(c) ? `${flag(c)} ${COUNTRIES[c] || c}` : (c || '');
function meta(b, long = false) {
  if (!b || b.blind) return 'Wird bei der Auflösung enthüllt';
  const country = long ? countryText(b.country) : (flag(b.country) || b.country || '');
  return [b.brewery, b.style, b.abv != null && b.abv !== '' ? fmt(b.abv, 1) + ' %' : '', country].filter(Boolean).map(esc).join(' · ');
}
/** Einheitliche Bier-Kacheln: Monogramm der Marke, Farbe nach Bierstil (ungefähr die Farbe im Glas).
    Keine Logos oder Produktbilder in Listen – die kommen aus zu vielen Quellen und sehen nie einheitlich aus. */
const STYLE_FAMILY = [
  [/alkoholfrei|alcohol.?free|radler|shandy|0[,.]0/i, 'fresh'],
  [/stout|porter|schwarz|dunkel|dark|quadrupel|black/i, 'dark'],
  [/ipa|pale ale|apa|neipa|hazy|\bale\b|bitter/i, 'hop'],
  [/weizen|weiss|weiß|wit|blanche|wheat|hefe/i, 'wheat'],
  [/märzen|marzen|bock|alt\b|altbier|\brot\b|\bred\b|amber|dubbel|tripel|trappist|strong|scotch|brown|rauch|flanders|lambic|frucht|kriek/i, 'amber'],
  [/pils|hell|lager|export|kölsch|kolsch|keller|zwickel|landbier|blonde|urtyp/i, 'pale'],
];
const STYLE_TILE = {
  pale: ['#F2CC8F', '#2B2D42'], amber: ['#E07A5F', '#2B2D42'], dark: ['#3D405B', '#F4F1DE'],
  hop: ['#81B29A', '#2B2D42'], wheat: ['#EADFBF', '#2B2D42'], fresh: ['#DCEBE2', '#3F6B57'], none: ['var(--surface-2)', 'var(--muted)'],
};
const styleFamily = b => (STYLE_FAMILY.find(([re]) => re.test(b?.style || b?.name || '')) || [0, 'none'])[1];
const NOISE = new Set(['bier', 'beer', 'brauerei', 'the', 'der', 'die', 'das', 'la', 'le', 'de', 'st', 'st.', 'sankt']);
function monogram(b) {
  const words = String(b?.name || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(w => w && !NOISE.has(w.toLowerCase()));
  const w = words[0] || '?';
  if (/^\d/.test(w)) return w.slice(0, 4);
  return w[0].toUpperCase() + (w[1] || '').toLowerCase();
}
/** Website der Brauerei: am Bier hinterlegt oder aus dem Katalog. */
const siteOf = b => b?.site || (CAT || []).find(c => c.keys.includes(beerKey(b?.name || '')))?.site || (b?.brewery ? (CAT || []).find(c => c.brewery === b.brewery && c.site)?.site : '') || '';
/** Website, deren Logo gezeigt wird – mit Korrekturen ('' = bewusst kein Logo). */
const cleanDomain = u => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
function logoSiteOf(b) {
  const site = cleanDomain(siteOf(b)), map = D?.logo_map || {};
  return site && site in map ? map[site] : site;
}
const logoSrc = site => `/api/logo?s=${encodeURIComponent(site)}&raw=1&v=${LS.get('bs-logo-v', 0)}`;
function thumb(b, s, cls = '') {
  if (!b || b.blind) return `<span class="thumb ${cls} tile-none" aria-hidden="true">?</span>`;
  const fam = styleFamily(b), [bg, ink] = STYLE_TILE[fam], site = D?.logos ? logoSiteOf(b) : '';
  // Logo (falls vorhanden) wird wie auf einen Bierdeckel gedruckt; die Leiste unten zeigt weiter den Stil.
  const logo = site ? `<img class="logo" src="${logoSrc(site)}" alt="" loading="lazy">` : '';
  return `<span class="thumb tile ${cls}" style="background:${bg};color:${ink};--tile:${bg}" aria-hidden="true">${esc(monogram(b))}${logo}</span>`;
}
document.addEventListener('load', e => { if (e.target.classList?.contains('logo')) e.target.parentElement?.classList.add('has-logo'); }, true);
document.addEventListener('error', e => { if (e.target.classList?.contains('logo')) e.target.remove(); }, true);

const SERVINGS = ['Fass', 'Flasche', 'Dose'];
const photoUrl = id => `/api/photo/${id}`;
/** Neuestes Foto zu einem Bier (aus den sichtbaren Bewertungen). */
function beerPhoto(id) {
  const r = D.ratings.filter(x => x.beer === id && x.photo && visible(x)).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))[0];
  return r ? r.photo : '';
}
const wishlist = (u = me) => (D.wishlist || {})[u] || [];
const wished = id => wishlist().includes(id);
/** „Prost!“: andere können anstoßen, bei eigenen Bewertungen sieht man nur die Zahl. */
function cheersBtn(r) {
  const n = (r.cheers || []).length, on = (r.cheers || []).includes(me);
  if (r.user === me) return n ? `<span class="cheers own" title="${esc(r.cheers.join(', '))}">${ICON.cheers}<span>${n}</span></span>` : '';
  return `<button class="cheers ${on ? 'on' : ''}" data-act="cheers" data-u="${esc(r.user)}" data-b="${r.beer}" data-s="${r.session || ''}" aria-pressed="${on}" aria-label="Prost an ${esc(r.user)}">${ICON.cheers}<span>${n ? n : 'Prost'}</span></button>`;
}
const ratingMeta = r => [ago(r.ts), r.session ? sessionOf(r.session)?.name || 'Tasting' : '', r.serving, r.place].filter(Boolean).map(esc).join(' · ');

/** Durchschnitt pro Bier: erst pro Person mitteln, damit Vieltrinker nicht mehrfach zählen. */
function beerAgg(id) {
  const per = {};
  for (const r of D.ratings) if (r.beer === id && visible(r)) (per[r.user] ||= []).push(r.value);
  const vals = Object.values(per).map(mean);
  return { avg: mean(vals), people: vals.length, per };
}
function lastTs(id) { return D.ratings.filter(r => r.beer === id).map(r => r.ts || '').sort().at(-1) || beer(id)?.created_at || ''; }
/** Pro Person: alle bekannten Biere mit eigener Durchschnittsnote. */
function personBeers(p) {
  const by = {};
  for (const r of knownRatings()) if (r.user === p) (by[r.beer] ||= []).push(r);
  return Object.entries(by).map(([id, rs]) => ({
    b: beer(id), v: mean(rs.map(r => r.value)), n: rs.length, fav: rs.some(r => r.favorite),
    ts: rs.map(r => r.ts || '').sort().at(-1), rs,
  }));
}
/** Paare mit ähnlichstem Geschmack: mittlere Abweichung bei gemeinsam bewerteten Bieren. */
function twins(list, filter, minCommon) {
  const by = {};
  for (const r of D.ratings) if (visible(r) && filter(r)) ((by[r.user] ||= {})[r.beer] ||= []).push(r.value);
  const m = u => Object.fromEntries(Object.entries(by[u] || {}).map(([k, v]) => [k, mean(v)]));
  const res = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = m(list[i]), B = m(list[j]), common = Object.keys(A).filter(k => k in B);
    if (common.length >= minCommon) res.push({ a: list[i], b: list[j], n: common.length, diff: mean(common.map(k => Math.abs(A[k] - B[k]))) });
  }
  return res.sort((a, b) => a.diff - b.diff);
}

// ------------------------------------------------------------------ Bier-Zuordnung
// Gleiche Regeln wie beer_key() im Server: Umlaute, Satzzeichen, Füllwörter und Schreibvarianten vereinheitlichen.
const STOP = new Set(['bier', 'beer', 'brauerei', 'brewery', 'premium', 'original', 'the', 'das', 'die', 'der']);
const SYN = { helles: 'hell', lagerbier: 'lager', pilsener: 'pils', pilsner: 'pils', hefeweizen: 'weizen', weizenbier: 'weizen', weissbier: 'weizen', hefeweissbier: 'weizen', hefeweisse: 'weizen', weisse: 'weizen', weissebier: 'weizen', alkoholfrei: 'af', alcoholfree: 'af' };
const fold = s => String(s || '').toLocaleLowerCase('de').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/(\d)[,.](\d)/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim();
function toks(s) {
  const t = fold(s).split(' ').filter(Boolean).map(x => SYN[x] || x).map(x => x === '00' || x === '0' ? 'af' : x);
  const f = t.filter(x => !STOP.has(x));
  return f.length ? f : t;
}
const beerKey = s => [...new Set(toks(s))].sort().join(' ');
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), pp = null;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1); // Buchstabendreher
      cur.push(v); best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    pp = prev; prev = cur;
  }
  return prev[b.length];
}
/** Ähnlichkeit eines Suchworts zu einem Wort des Bieres (0–1). last = noch am Tippen, Präfix reicht. */
function tokSim(q, c, last) {
  if (q === c) return 1;
  if (c.startsWith(q) && (q.length >= 3 || (last && q.length >= 1))) return q.length >= 3 ? 0.92 : 0.75;
  if (q.length >= 4 && lev(q, c, 1) <= 1) return 0.86;
  if (q.length >= 7 && lev(q, c, 2) <= 2) return 0.72;
  if (q.length >= 4 && c.includes(q)) return 0.72;
  if (last && q.length >= 4 && c.length > q.length && lev(q, c.slice(0, q.length), 1) <= 1) return 0.7; // Tippfehler beim Tippen
  if (c.length >= 4 && q.includes(c)) return 0.62;
  return 0;
}
/** Ähnlichkeit einer Suche zu einer Wortliste: alle Suchwörter müssen passen, abgedeckte Bierwörter geben Bonus. */
function simTokens(qt, ct, typing = false) {
  if (!qt.length || !ct.length) return 0;
  const hit = new Set();
  let sum = 0;
  qt.forEach((q, i) => {
    let best = 0, at = -1;
    ct.forEach((c, j) => { const s = tokSim(q, c, typing && i === qt.length - 1); if (s > best) { best = s; at = j; } });
    if (at >= 0 && best >= 0.6) hit.add(at);
    sum += best;
  });
  return (sum / qt.length) * (0.78 + 0.22 * hit.size / ct.length);
}
function beerSim(q, b, typing) {
  const qt = toks(q);
  return Math.max(simTokens(qt, toks(b.name), typing), simTokens(qt, toks(`${b.brewery || ''} ${b.name}`), typing) * 0.97);
}
// ---------- Hinterlegter Katalog (offline)
let CAT = null, CAT_CODES = new Map();
async function catalog() {
  if (!CAT) {
    try {
      CAT = (await (await fetch('/catalog.json')).json()).beers.map(c => ({
        ...c, source: c.src === 'off' ? 'off' : 'katalog', keys: [c.name, ...c.aliases].map(beerKey),
        tk: [c.name, ...c.aliases].map(toks), tkb: toks(`${c.brewery} ${c.name}`),
      }));
      CAT_CODES = new Map(CAT.flatMap(c => (c.codes || []).map(code => [code, c])));
    }
    catch { CAT = []; }
  }
  return CAT;
}
catalog();
const catEntryFor = b => (CAT || []).find(c => c.keys.includes(beerKey(b.name)));
function catSim(q, c, typing, qt = toks(q)) {
  let best = simTokens(qt, c.tkb, typing) * 0.95;
  for (const t of c.tk) best = Math.max(best, simTokens(qt, t, typing));
  return c.src === 'off' ? best : best + 0.02; // gepflegte Einträge bei Gleichstand bevorzugen
}
/** Katalog-Eintrag zu einem Barcode (offline). */
const catByCode = code => CAT_CODES.get(String(code || '').trim()) || null;
/** Biere im Bierbuch zu einer Suche (Barcode, Schlüssel, unscharf). */
function searchLocal(q, n = 6) {
  const code = /^\d{8,14}$/.test(q.trim()) ? q.trim() : '';
  return D.beers.filter(shown).map(b => ({ b, s: code ? (b.barcode === code ? 2 : 0) : beerKey(b.name) === beerKey(q) ? 1.5 : beerSim(q, b, true) }))
    .filter(x => x.s >= 0.6).sort((a, b) => b.s - a.s || beerAgg(b.b.id).people - beerAgg(a.b.id).people).slice(0, n);
}
/** Katalog-Treffer, die noch nicht im Bierbuch stehen. */
function searchCatalog(q, n = 5) {
  if (/^\d+$/.test(q.trim())) { const c = catByCode(q); return c ? [{ ...c, barcode: q.trim() }] : []; }
  const have = new Set(D.beers.filter(shown).map(b => beerKey(b.name))), qt = toks(q);
  return (CAT || []).filter(c => !c.keys.some(k => have.has(k))).map(c => ({ c, s: catSim(q, c, true, qt) }))
    .filter(x => x.s >= 0.62).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.c);
}
/** Eindeutiger Katalog-Treffer für automatisches Ergänzen (z. B. „Zäpfle“ → Rothaus Pils Tannenzäpfle). */
function catBest(name) {
  const k = beerKey(name), exact = (CAT || []).find(c => c.keys.includes(k));
  if (exact) return exact;
  const r = (CAT || []).map(c => [catSim(name, c, false), c]).sort((a, b) => b[0] - a[0]);
  return r[0] && r[0][0] >= 0.86 && (!r[1] || r[0][0] - r[1][0] >= 0.08) ? r[0][1] : null;
}
/** Wahrscheinlich dasselbe Bier? (für „Meinst du …?“ und die Doppelten-Suche) */
function sameBeer(a, b) {
  if (a.barcode && a.barcode === b.barcode) return 1;
  if (beerKey(a.name) === beerKey(b.name)) return 1;
  const ca = catEntryFor(a);
  if (ca && ca === catEntryFor(b)) return 0.97;
  return Math.min(beerSim(a.name, b, false), beerSim(b.name, a, false));
}
let dupCache = null;
function findDuplicates() {
  const ign = LS.get('bs-not-dupes', []), ck = `${D.rev}:${ign.length}:${!!CAT}`;
  if (dupCache?.k === ck) return dupCache.list;
  const ignored = new Set(ign);
  const list = D.beers.filter(shown), out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], key = [a.id, b.id].sort().join(':');
    if (ignored.has(key)) continue;
    const s = sameBeer(a, b);
    if (s >= 0.84) out.push({ a, b, s, key });
  }
  out.sort((x, y) => y.s - x.s);
  dupCache = { k: ck, list: out };
  return out;
}
const missingInfo = b => shown(b) && (b.abv == null || b.abv === '' || !b.style || !b.brewery);
const candMeta = c => [c.brewery, c.style, c.abv != null && c.abv !== '' ? fmt(c.abv, 1) + ' %' : '', countryText(countryCode(c.country)), c.quantity].filter(Boolean).map(esc).join(' · ');
const candThumb = c => thumb({ id: '', name: c.name, brewery: c.brewery, style: c.style });
const offToCand = p => ({ source: 'off', name: p.name, brewery: p.brand, style: p.style, abv: p.abv, barcode: p.code, image: p.image, quantity: p.quantity, country: '', site: '' });
/** Felder eines Kandidaten für ein Bier; mit onlyEmpty nur Lücken füllen. */
function candFields(c, b = {}, onlyEmpty = false) {
  const out = {};
  const put = (k, v) => { if (v == null || v === '') return; if (onlyEmpty && b[k] != null && b[k] !== '') return; out[k] = v; };
  put('brewery', c.brewery); put('style', c.style); put('abv', c.abv); put('country', countryCode(c.country)); put('site', c.site);
  if (!b.barcode) put('barcode', c.barcode);
  if (!b.image) put('image', c.image);
  if (Object.keys(out).length) out.source = c.source;
  return out;
}

// ------------------------------------------------------------------ Netzwerk & Offline-Warteschlange
async function http(path, body) {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { }
  if (!r.ok) { const e = new Error(j.error || 'Fehler ' + r.status); e.server = true; throw e; }
  return j;
}
function setOnline(v) {
  online = v;
  const n = outbox.length, el = $('#net');
  el.hidden = v && !n;
  el.textContent = v ? `Synchronisiere ${n} …` : `Offline${n ? ' · ' + n + ' wartend' : ''}`;
}
async function flush() {
  while (outbox.length) {
    const it = outbox[0];
    try { await http('/api/' + it.path, it.body); }
    catch (e) { if (!e.server) return false; toast('Nicht synchronisiert: ' + e.message); }
    outbox.shift(); LS.set('bs-outbox', outbox);
  }
  return true;
}
/** Sendet eine Aktion. Mit queue:true wird sie offline zwischengespeichert und lokal angewendet. */
async function send(path, body, opt = {}) {
  const enqueue = () => {
    outbox.push({ path, body: { ...body, ...(opt.offlineBody || {}) } }); LS.set('bs-outbox', outbox);
    opt.apply?.(); LS.set('bs-cache', D); setOnline(false); requestRender(); return { queued: true, id: body.id };
  };
  if (opt.queue && outbox.length) return enqueue();
  try {
    const j = await http('/api/' + path, body);
    await refresh(true);
    return j;
  } catch (e) {
    if (!e.server && opt.queue) return enqueue();
    throw e.server ? e : new Error('Keine Verbindung zum Server');
  }
}
let refreshing = null;
async function refresh(force = false) {
  if (refreshing && !force) return refreshing;
  refreshing = (async () => {
    try {
      if (outbox.length && !(await flush())) throw new TypeError('offline');
      const j = await http(`/api/state?user=${encodeURIComponent(me)}${force || !D ? '' : '&since=' + D.rev}`);
      setOnline(true);
      if (!j.unchanged) { D = j; LS.set('bs-cache', D); onData(); }
    } catch (e) {
      setOnline(false);
      if (!D) $('#main').innerHTML = '<div class="card empty" style="margin-top:20vh"><h2>Server nicht erreichbar</h2><p>Bist du im richtigen WLAN bzw. VPN?</p><button class="btn primary" data-act="retry">Nochmal versuchen</button></div>';
    } finally { refreshing = null; }
  })();
  return refreshing;
}
ACT.retry = () => refresh(true);
function onData() {
  if (me && !D.people.includes(me) && !outbox.some(o => o.path === 'person')) { me = ''; LS.set('bs-user', ''); }
  for (const k of Object.keys(drafts)) if (!drafts[k].dirty) delete drafts[k];
  // „Im Glas“ folgen: setzt jemand im Tasting das nächste Bier, springen alle mit
  const r = route();
  for (const s of D.sessions) {
    const prev = lastCurrent[s.id];
    if (prev !== undefined && prev !== s.current && s.current && r.page === 'tasting' && r.id === s.id) {
      const cur = pick[s.id];
      if ((!cur || cur === prev) && !drafts[`${s.id}:${cur}:${me}`]?.dirty) {
        pick[s.id] = s.current; tastingSeg = 'rate';
        toast('Neu im Glas: ' + label(beer(s.current), s)); haptic(30);
      }
    }
    lastCurrent[s.id] = s.current;
  }
  requestRender();
}
function applyRate(body) {
  D.ratings = D.ratings.filter(r => !(r.user === body.user && r.beer === body.beer && ctxEq(r.session, body.session)));
  if (body.favorite && body.session) D.ratings.forEach(r => { if (r.user === body.user && r.session === body.session) r.favorite = false; });
  D.ratings.push({ ...body, value: round(body.value, 2) });
  const s = D.sessions.find(x => x.id === body.session);
  if (s && !s.people.includes(body.user)) s.people.push(body.user);
}

// ------------------------------------------------------------------ Navigation
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page = '', ...rest] = h.split('/');
  return { page: page || 'start', id: rest.length ? decodeURIComponent(rest.join('/')) : null, key: h };
}
const href = (page, id) => '#/' + page + (id != null ? '/' + encodeURIComponent(id) : '');
function go(to) {
  if (sheet.open) { pendingNav = to; closeSheet(); return; }
  if (location.hash === to) render(); else location.hash = to;
}
ACT.go = el => go(el.dataset.to);
const PARENT = { brauerei: ['#/biere', 'Biere'], bier: ['#/biere', 'Biere'], person: ['#/leute', 'Leute'], tasting: ['#/tastings', 'Tastings'], ich: ['#/', 'Übersicht'] };
ACT.back = () => { if (history.state?.inApp) history.back(); else go(PARENT[route().page]?.[0] || '#/'); };
addEventListener('hashchange', () => { history.replaceState({ ...(history.state || {}), inApp: true }, ''); render(); });

// ------------------------------------------------------------------ Rendering
function editing() {
  const a = document.activeElement;
  return a && $('#main').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}
function requestRender() { if (editing()) pendingRender = true; else render(); }
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !editing()) { pendingRender = false; render(); } }, 80));

const PAGES = {
  start: { tab: 'start', title: 'Übersicht', fn: renderStart },
  biere: { tab: 'biere', title: 'Biere', fn: renderBeers },
  bier: { tab: 'biere', fn: renderBeer },
  leute: { tab: 'leute', title: 'Leute', fn: renderPeople },
  person: { tab: 'leute', fn: renderPerson },
  tastings: { tab: 'tastings', title: 'Tastings', fn: renderTastings },
  tasting: { tab: 'tastings', fn: renderTasting },
  brauerei: { tab: 'biere', fn: renderBrewery },
  ich: { tab: '', title: 'Profil & Einstellungen', fn: renderSettings },
};
function render() {
  if (!D) return;
  const r = route(), landing = !me;
  const pg = PAGES[r.page] || PAGES.start;
  document.body.classList.toggle('no-tabs', landing);
  $('#tabbar').classList.toggle('hide', landing);
  $('#me').hidden = landing;
  for (const a of $$('#tabbar a')) a.classList.toggle('on', a.dataset.tab === pg.tab);
  moveLens();
  if (me) { $('#me').textContent = initials(me); $('#me').style.background = tone(me); $('#me').style.color = toneInk(me); }
  const par = !landing && PARENT[r.page];
  $('#back').hidden = !par;
  if (par) $('#back-label').textContent = par[1];
  const out = landing ? { html: renderLanding(), title: '' } : pg.fn(r);
  const html = typeof out === 'string' ? out : out.html;
  const title = typeof out === 'string' ? pg.title : out.title ?? pg.title;
  $('#topbar-title').textContent = title || '';
  $('#topbar-title').classList.toggle('show', !!title);
  const changed = lastRouteKey !== (landing ? '~' : r.key);
  if (changed && lastRouteKey !== null) scrollPos[lastRouteKey] = scrollY;
  const y = changed ? (scrollPos[r.key] || 0) : scrollY;
  $('#main').innerHTML = `<div class="${changed ? 'view' : ''}">${html}</div>`;
  scrollTo(0, y);
  const on = $('main .chips .chip.on');
  if (on && r.page === 'tasting') { const c = on.parentElement; c.scrollLeft = on.offsetLeft - (c.clientWidth - on.offsetWidth) / 2; }
  lastRouteKey = landing ? '~' : r.key;
  document.title = title && r.page !== 'start' ? `${title} · Bierstudio` : 'Bierstudio';
}
/** Die Glas-Linse in der Tabbar wandert federnd zum aktiven Tab. */
function moveLens() {
  const lens = $('#lens'), on = $('#tabbar a.on');
  lens.style.opacity = on ? 1 : 0;
  if (!on) return;
  const w = Math.min(on.offsetWidth + 6, 78);
  lens.style.width = w + 'px';
  lens.style.transform = `translateX(${on.offsetLeft + (on.offsetWidth - w) / 2}px)`;
}
addEventListener('resize', moveLens);
for (const a of $$('#tabbar a')) a.addEventListener('click', () => { delete scrollPos[a.getAttribute('href').replace(/^#\/?/, '')]; });
addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', scrollY > 30), { passive: true });

const largeTitle = (t, sub = '') => `<h1 class="large-title">${esc(t)}</h1>${sub ? `<p class="lead small" style="margin:0 2px 4px">${sub}</p>` : ''}`;
const emptyCard = (icon, title, text, btn = '') => `<div class="card empty"><h2>${esc(title)}</h2><p>${text}</p>${btn}</div>`;

// ---------- Landing (noch keine Person gewählt)
function renderLanding() {
  const ps = people(), nb = D.beers.filter(shown).length, nr = knownRatings().length;
  return `<section class="landing">
    <img class="hero-mark" src="/icons/icon.svg" alt="" width="84" height="84">
    <h1>Dein Bierbuch.<br><em>Mit deinen Leuten.</em></h1>
    <p class="lead">Trag ein, was du gerade trinkst, gib eine Note und sieh, was die anderen davon halten.</p>
    <div class="features">
      <div class="feature"><span class="ic">${ICON.bolt}</span><div><b>In Sekunden eingetragen</b><span>Name tippen, Note ziehen, fertig. Bekannte Biere erkennt die App, auch bei Spitznamen und Tippfehlern.</span></div></div>
      <div class="feature"><span class="ic">${ICON.people}</span><div><b>Sieh, was die anderen trinken</b><span>Jede Person hat ihre Seite mit allen Bieren und Noten.</span></div></div>
      <div class="feature"><span class="ic">${ICON.cheers}</span><div><b>Tastings, wenn ihr zusammensitzt</b><span>Alle bewerten gleichzeitig dasselbe Bier, auf Wunsch auch blind.</span></div></div>
    </div>
    ${nb ? `<p class="small muted" style="margin:-14px 0 22px">${nb} Biere · ${nr} Bewertungen · ${ps.length} ${ps.length === 1 ? 'Person' : 'Personen'} sind schon dabei.</p>` : ''}
    <h2 class="title2" style="margin-bottom:12px">Wer bist du?</h2>
    ${ps.length ? `<div class="who-grid">${ps.map(p => `<button data-act="setUser" data-v="${esc(p)}">${avatar(p)}<span>${esc(p)}</span></button>`).join('')}</div>
    <p class="small muted" style="margin:18px 2px 8px">Neu hier?</p>` : ''}
    <div class="row"><input class="field" id="new-person" placeholder="Dein Name" maxlength="40" autocomplete="given-name" enterkeyhint="go"><button class="btn primary" data-act="addUser">Los</button></div>
    <p class="tiny faint" style="margin-top:14px">Namen sind keine geschützten Konten. Bitte nur deine eigenen Noten bearbeiten.</p>
  </section>`;
}
function setUser(name) {
  me = name; LS.set('bs-user', me); closeSheet(); toast('Hallo ' + me); haptic(20);
  if (!location.hash || location.hash === '#/') render(); else go('#/');
  refresh(true);
}
ACT.setUser = el => setUser(el.dataset.v);
ACT.addUser = async () => {
  const inp = $('#new-person'), name = inp.value.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) return inp.focus();
  try { await send('person', { name }, { queue: true, apply: () => { if (!D.people.includes(name)) D.people.push(name); } }); setUser(name); }
  catch (e) { toast(e.message); }
};
ACT.switchUser = () => {
  openSheet(head('Wer bist du?') + `<div class="list">${people().map(p => `<button class="item" data-act="setUser" data-v="${esc(p)}">${avatar(p)}<div class="grow"><h3>${esc(p)}</h3></div>${p === me ? '<b style="color:var(--accent-text)">✓</b>' : ''}</button>`).join('')}</div>
    <label class="lbl" for="new-person">Neu dabei?</label><div class="row"><input class="field" id="new-person" placeholder="Name" maxlength="40" enterkeyhint="go"><button class="btn primary" data-act="addUser">OK</button></div>`);
};

// ---------- Übersicht
function liveTasting() {
  const s = sessionOf(D.active);
  return s && !s.closed ? s : null;
}
function renderStart() {
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Prost';
  const mine = personBeers(me).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  const all = knownRatings().filter(r => r.ts).sort((a, b) => b.ts.localeCompare(a.ts));
  const latest = all[0], feed = all.slice(1, 12);
  const top = D.beers.filter(shown).map(b => ({ b, ...beerAgg(b.id) })).filter(x => x.avg != null);
  const minP = top.some(x => x.people >= 2) ? 2 : 1;
  const best = top.filter(x => x.people >= minP).sort((a, b) => b.avg - a.avg || b.people - a.people).slice(0, 5);
  const ps = people().map(p => ({ p, n: personBeers(p).length, ts: D.ratings.filter(r => r.user === p).map(r => r.ts || '').sort().at(-1) || '' }))
    .sort((a, b) => b.ts.localeCompare(a.ts) || b.n - a.n);
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return {
    title: 'Übersicht', html: `
    <div class="greet"><div class="eyebrow">${esc(date)}</div><h1 class="large-title">${hello}, ${esc(me)}</h1></div>
    <button class="drink-cta" data-act="add"><span class="glass-ic">${ICON.glass}</span><span class="grow"><b>Was trinkst du gerade?</b><span>Eintragen und bewerten</span></span><span class="chev-r">›</span></button>
    ${mine.length ? `<div class="chips again" aria-label="Nochmal trinken">${mine.slice(0, 8).map(x => `<button class="chip" data-act="rate" data-id="${x.b.id}">${thumb(x.b)}<span>${esc(x.b.name.length > 22 ? x.b.name.slice(0, 21) + '…' : x.b.name)}</span></button>`).join('')}</div>` : ''}
    ${latest ? latestCard(latest) : ''}
    ${wishlist().length ? `<div class="section-title">Auf deiner Merkliste <a href="${href('person', me)}">Alle</a></div><div class="chips">${wishlist().map(beer).filter(shown).slice(0, 10).map(b => `<a class="chip wish-chip" href="${href('bier', b.id)}">${thumb(b)}<span>${esc(b.name.length > 22 ? b.name.slice(0, 21) + '…' : b.name)}</span></a>`).join('')}</div>` : ''}
    <div class="section-title">Davor getrunken</div>
    ${feed.length ? `<div class="list feed">${feed.map(feedItem).join('')}</div>`
      : latest ? '<p class="small muted" style="margin:0 4px">Noch nichts weiter. Das nächste Bier erscheint hier für alle.</p>' : emptyCard('🍺', 'Noch nichts getrunken', 'Trag dein erstes Bier ein. Es erscheint hier für alle.')}
    ${ps.length > 1 ? `<div class="section-title">Leute <a href="#/leute">Alle</a></div><div class="people-row">${ps.map(x => `<a href="${href('person', x.p)}">${avatar(x.p)}<span>${esc(x.p)}</span></a>`).join('')}</div>` : ''}
    ${best.length ? `<div class="section-title">Bestenliste <a href="#/biere">Alle Biere</a></div><div class="list">${best.map((x, i) => `<a class="item" href="${href('bier', x.b.id)}"><span class="num faint" style="width:16px;font-weight:700;text-align:center">${i + 1}</span>${thumb(x.b)}<div class="grow"><h3>${esc(x.b.name)}</h3><div class="sub">${x.people} ${x.people === 1 ? 'Person' : 'Personen'}${meta(x.b) ? ' · ' + meta(x.b) : ''}</div></div>${score(x.avg)}</a>`).join('')}</div>` : ''}
    <div class="kpis" style="margin-top:28px"><a class="kpi" href="#/biere"><b>${D.beers.filter(shown).length}</b><span>Biere</span></a><div class="kpi"><b>${knownRatings().length}</b><span>Bewertungen</span></div><a class="kpi" href="#/leute"><b>${ps.length}</b><span>Leute</span></a></div>`,
  };
}

/** Eintrag im Verlauf: ganze Zeile führt zum Bier, „Prost“ ist ein eigener Knopf. */
function feedItem(r) {
  const b = beer(r.beer);
  return `<div class="item feed-item" data-act="go" data-to="${href('bier', b.id)}" role="link" tabindex="0">${avatar(r.user)}<div class="grow">
    <div class="small"><b>${esc(r.user)}</b> <span class="when">· ${ratingMeta(r)}</span></div>
    <h3>${esc(b.name)}${r.favorite ? ' <span class="heart">♥</span>' : ''}</h3>
    ${r.note ? `<div class="sub">„${esc(r.note)}“</div>` : r.tags?.length ? `<div class="sub">${r.tags.map(esc).join(' · ')}</div>` : ''}
    ${r.photo ? `<img class="feed-photo" src="${photoUrl(r.photo)}" alt="Foto von ${esc(r.user)}" loading="lazy">` : ''}
    ${cheersBtn(r) ? `<div class="feed-actions">${cheersBtn(r)}</div>` : ''}</div>${score(r.value)}</div>`;
}

/** Das zuletzt bewertete Bier, groß. */
function latestCard(r) {
  const b = beer(r.beer), ag = beerAgg(b.id);
  return `<div class="section-title">Zuletzt bewertet</div>
  <div class="latest" data-act="go" data-to="${href('bier', b.id)}" role="link" tabindex="0">
    ${r.photo ? `<img class="latest-photo" src="${photoUrl(r.photo)}" alt="Foto zu ${esc(b.name)}">` : ''}
    <div class="latest-top">${r.photo ? '' : thumb(b, null, 'xl')}<div class="grow">
      <div class="latest-who">${avatar(r.user, 'sm')}<span><b>${esc(r.user)}</b> · ${ratingMeta(r)}</span></div>
      <h2 class="latest-name">${esc(b.name)}${r.favorite ? ' <span class="heart">♥</span>' : ''}</h2>
      <div class="small muted">${meta(b) || '&nbsp;'}</div></div></div>
    ${r.note ? `<p class="latest-note">„${esc(r.note)}“</p>` : ''}
    ${r.tags?.length ? `<div class="tags">${r.tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="latest-foot"><div><span class="latest-score" style="color:${scoreFg(r.value)}">${fmt(r.value, 1)}</span><span class="of10">/10</span><div class="tiny muted">${esc(verdict(r.value))}</div></div>
      <div class="latest-right">${cheersBtn(r)}${ag.people > 1 ? `<div class="latest-avg"><b>${fmt(ag.avg, 1)}</b><span>Ø von ${ag.people}</span></div>` : ''}</div></div>
  </div>`;
}

// ---------- Biere
function renderBeers() {
  const vis = D.beers.filter(shown);
  const f = [['all', 'Alle'], ['mine', 'Von mir'], ['new', 'Noch nicht probiert'], ['wish', 'Merkliste'], ['fav', '♥ Favoriten']];
  const dup = findDuplicates().length, miss = vis.filter(missingInfo).length;
  return {
    title: 'Biere', html: `${largeTitle('Biere', `${vis.length} im Bierbuch`)}
    <div class="search" style="margin-top:14px">${ICON.search}<input class="field" type="search" id="beer-q" data-on="beerQ" placeholder="Bier, Brauerei oder Stil" value="${esc(beerList.q)}" enterkeyhint="search" autocomplete="off"></div>
    <div class="between" style="margin:12px 0 10px"><div class="chips grow">${f.map(([k, t]) => `<button class="chip ${beerList.f === k ? 'on' : ''}" data-act="beerF" data-v="${k}">${t}</button>`).join('')}</div></div>
    <div class="between" style="margin:0 2px 10px"><span class="small muted" id="beer-n"></span>
      <select class="field" style="width:auto;min-height:34px;padding:4px 32px 4px 12px;font-size:.88rem;border-radius:10px" data-change="beerSort" aria-label="Sortierung">${[['recent', 'Zuletzt getrunken'], ['avg', 'Beste Note'], ['mine', 'Meine Note'], ['count', 'Am meisten bewertet'], ['az', 'A–Z']].map(([k, t]) => `<option value="${k}" ${beerList.sort === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div id="beer-list">${beerRows()}</div>
    ${dup ? `<button class="hint-card" data-act="dupes"><span class="hint-ic">${ICON.link}</span><span class="grow"><b>${dup} ${dup === 1 ? 'mögliches Doppel' : 'mögliche Doppelte'}</b><span>Gleiche Biere unter verschiedenen Namen zusammenführen</span></span><span class="chev">›</span></button>` : ''}
    ${miss ? `<button class="hint-card" data-act="bulkEnrich"><span class="hint-ic">${ICON.spark}</span><span class="grow"><b>${miss} ${miss === 1 ? 'Bier' : 'Biere'} mit fehlenden Infos</b><span>Brauerei, Stil und Alkohol aus dem Katalog ergänzen</span></span><span class="chev">›</span></button>` : ''}`,
  };
}
function beerRows() {
  const q = beerList.q.trim();
  let rows = D.beers.filter(shown).map(b => {
    const ag = beerAgg(b.id), mine = D.ratings.filter(r => r.beer === b.id && r.user === me && visible(r));
    return { b, ag, my: mine.length ? mean(mine.map(r => r.value)) : null, fav: mine.some(r => r.favorite), last: lastTs(b.id), s: 0 };
  });
  if (q) {
    for (const x of rows) x.s = Math.max(beerSim(q, x.b, true), fold(`${x.b.style} ${x.b.brewery}`).includes(fold(q)) ? 0.7 : 0, x.b.barcode === q ? 2 : 0);
    rows = rows.filter(x => x.s >= 0.6);
  }
  if (beerList.f === 'mine') rows = rows.filter(x => x.my != null);
  if (beerList.f === 'new') rows = rows.filter(x => x.my == null);
  if (beerList.f === 'fav') rows = rows.filter(x => x.fav);
  if (beerList.f === 'wish') rows = rows.filter(x => wished(x.b.id));
  const by = {
    recent: (a, b) => b.last.localeCompare(a.last), avg: (a, b) => (b.ag.avg ?? -1) - (a.ag.avg ?? -1), mine: (a, b) => (b.my ?? -1) - (a.my ?? -1),
    count: (a, b) => b.ag.people - a.ag.people, az: (a, b) => a.b.name.localeCompare(b.b.name, 'de'),
  };
  rows.sort(q ? (a, b) => b.s - a.s : by[beerList.sort]);
  setTimeout(() => { const n = $('#beer-n'); if (n) n.textContent = rows.length === 1 ? '1 Bier' : rows.length + ' Biere'; });
  if (!rows.length) return emptyCard('🔍', 'Nichts gefunden', q ? 'Noch nicht im Bierbuch.' : 'Hier ist noch nichts.', q ? `<button class="btn primary" data-act="add" data-name="${esc(q)}">„${esc(q)}“ eintragen</button>` : '');
  return `<div class="list">${rows.map(x => `<a class="item" href="${href('bier', x.b.id)}">${thumb(x.b)}
    <div class="grow"><h3>${esc(x.b.name)}${x.fav ? ' <span class="heart">♥</span>' : ''}</h3><div class="sub">${meta(x.b) || 'Keine Infos'}</div></div>
    ${scoreCol(x.ag.avg, x.my != null ? 'ich ' + fmt(x.my, 1) : x.ag.people ? x.ag.people + '×' : 'neu')}</a>`).join('')}</div>`;
}
ON.beerQ = el => { beerList.q = el.value; $('#beer-list').innerHTML = beerRows(); };
ACT.beerF = el => { beerList.f = el.dataset.v; render(); };
CH.beerSort = el => { beerList.sort = el.value; $('#beer-list').innerHTML = beerRows(); };

// ---------- Bier-Detail
function renderBeer(r) {
  const b = beer(r.id);
  if (!b) return emptyCard('🤷', 'Bier nicht gefunden', 'Vielleicht wurde es gelöscht oder zusammengeführt.', '<a class="btn primary" href="#/biere">Zu den Bieren</a>');
  const ag = beerAgg(b.id), rs = D.ratings.filter(x => x.beer === b.id && visible(x)).sort((a, c) => (c.ts || '').localeCompare(a.ts || ''));
  const mySolo = own(null, b.id), live = liveTasting(), canAdd = live && !live.beers.includes(b.id);
  const name = label(b);
  return {
    title: name, html: `
    <div class="page-head">${thumb(b, null, 'lg')}<div class="grow"><h1 class="large-title">${esc(name)}</h1><div class="small muted">${b.brewery && !b.blind ? `<a href="${href('brauerei', b.brewery)}">${esc(b.brewery)}</a>${meta({ ...b, brewery: '' }, true) ? ' · ' + meta({ ...b, brewery: '' }, true) : ''}` : meta(b, true) || 'Keine weiteren Infos'}</div>
      ${b.barcode ? `<div class="tiny faint" style="margin-top:2px">EAN ${esc(b.barcode)}</div>` : ''}</div></div>
    <div class="card"><div class="between"><div class="big-avg"><b style="color:${scoreFg(ag.avg)}">${fmt(ag.avg, 1)}</b><span>Ø von ${ag.people} ${ag.people === 1 ? 'Person' : 'Personen'}</span></div></div>
      ${rs.length ? `<div class="strip">${Object.entries(ag.per).map(([u, v]) => `<span class="pt" style="left:${mean(v) * 10}%;background:${toneDot(u)}" title="${esc(u)}"></span>`).join('')}${ag.avg != null ? `<span class="avg" style="left:${ag.avg * 10}%"></span>` : ''}</div><div class="scale"><span>0</span><span>5</span><span>10</span></div>` : ''}
      <div class="btns"><button class="btn primary" data-act="rate" data-id="${b.id}">${mySolo ? `Meine Note ändern (${fmt(mySolo.value, 1)})` : 'Bewerten'}</button>${b.blind ? '' : `<button class="btn ${wished(b.id) ? 'on-wish' : ''}" data-act="wish" data-id="${b.id}" aria-pressed="${wished(b.id)}">${wished(b.id) ? '✓ Gemerkt' : 'Merken'}</button>`}${canAdd ? `<button class="btn" data-act="addExisting" data-id="${b.id}">Zum Tasting</button>` : ''}</div></div>
    ${(() => { const ph = rs.filter(x => x.photo); return ph.length ? `<div class="section-title">Fotos</div><div class="photo-row">${ph.map(x => `<img src="${photoUrl(x.photo)}" alt="Foto von ${esc(x.user)}" loading="lazy">`).join('')}</div>` : ''; })()}
    ${missingInfo(b) ? `<button class="hint-card" data-act="enrich" data-id="${b.id}"><span class="hint-ic">${ICON.spark}</span><span class="grow"><b>Infos ergänzen</b><span>${[b.brewery ? '' : 'Brauerei', b.style ? '' : 'Stil', b.abv == null || b.abv === '' ? 'Alkohol' : ''].filter(Boolean).join(', ')} fehlt</span></span><span class="chev">›</span></button>` : ''}
    <div class="section-title">Bewertungen</div>
    <div class="list">${rs.map(x => `<div class="item" data-act="go" data-to="${href('person', x.user)}" role="link" tabindex="0" style="align-items:flex-start">${avatar(x.user)}<div class="grow"><h3>${esc(x.user)}${x.favorite ? ' <span class="heart">♥</span>' : ''}</h3><div class="sub">${ratingMeta(x) || '&nbsp;'}</div>
      ${x.tags?.length ? `<div class="tags">${x.tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}${cheersBtn(x) ? `<div class="feed-actions">${cheersBtn(x)}</div>` : ''}</div>${score(x.value)}</div>`).join('') || '<div class="item plain muted">Noch keine Bewertungen.</div>'}</div>
    ${b.blind ? '' : `<div class="list" style="margin-top:28px">
      <button class="item plain" data-act="editBeer" data-id="${b.id}"><div class="grow"><h3>Bearbeiten</h3></div><span class="chev">›</span></button>
      ${D.logos && siteOf(b) ? `<button class="item plain" data-act="logoFix" data-id="${b.id}"><div class="grow"><h3>Logo korrigieren</h3><div class="sub">${logoSiteOf(b) ? 'Logo von ' + esc(logoSiteOf(b)) : 'Logo ausgeblendet'}</div></div><span class="chev">›</span></button>` : ''}
      <button class="item plain" data-act="enrich" data-id="${b.id}"><div class="grow"><h3>Infos suchen</h3><div class="sub">Katalog, Wikidata, Open Food Facts</div></div><span class="chev">›</span></button>
      <button class="item plain" data-act="mergeInto" data-id="${b.id}"><div class="grow"><h3>Doppelt? Zusammenführen</h3><div class="sub">Ein anderes Bier hierin aufgehen lassen</div></div><span class="chev">›</span></button>
      <button class="item plain" data-act="deleteBeer" data-id="${b.id}"><div class="grow"><h3 style="color:var(--danger)">Löschen</h3></div></button></div>`}`,
  };
}
/** Logo prüfen und korrigieren: gilt für alle Biere dieser Brauerei-Website und für alle Personen. */
ACT.logoFix = el => {
  const b = beer(el.dataset.id), site = cleanDomain(siteOf(b)), cur = logoSiteOf(b), own = site in (D.logo_overrides || {});
  openSheet(head('Logo korrigieren') + `<p class="sheet-sub">${esc(b.brewery || b.name)} · Website ${esc(site)}. Die Korrektur gilt für alle Biere dieser Brauerei.</p>
    <div class="logo-preview"><div class="logo-box" id="lf-box">${cur ? `<img src="${logoSrc(cur)}" alt="Aktuelles Logo" id="lf-img">` : '<span class="muted small">Kein Logo</span>'}</div>
      <div class="small muted" id="lf-cap">${cur ? 'Aktuell: ' + esc(cur) : 'Logo ist ausgeblendet'}</div></div>
    <label class="lbl" for="lf-site">Logo von dieser Website holen</label>
    <div class="row"><input class="field" id="lf-site" value="${esc(cur || site)}" inputmode="url" autocomplete="off" spellcheck="false" placeholder="z. B. coronausa.com"><button class="btn" data-act="logoPreview">Vorschau</button></div>
    <p class="tiny muted">Tipp: Manche Marken haben ihr Logo unter einer Länder-Website, z. B. coronausa.com statt corona.com.</p>
    <div class="btns"><button class="btn primary" data-act="logoApply" data-site="${esc(site)}">Übernehmen</button></div>
    <div class="list" style="margin-top:16px"><button class="item plain" data-act="logoNone" data-site="${esc(site)}"><div class="grow"><h3>Kein Logo für diese Brauerei</h3><div class="sub">Dann erscheint die Farbkachel</div></div></button>
    ${own ? `<button class="item plain" data-act="logoReset" data-site="${esc(site)}"><div class="grow"><h3>Korrektur zurücksetzen</h3></div></button>` : ''}</div>`);
};
ACT.logoPreview = () => {
  const d = cleanDomain($('#lf-site').value);
  if (!d) return toast('Bitte eine Website eingeben');
  $('#lf-box').innerHTML = `<img src="${logoSrc(d)}&t=${Date.now()}" alt="Vorschau">`;
  $('#lf-cap').textContent = 'Lädt …';
  const img = $('#lf-box img');
  img.onload = () => { $('#lf-cap').textContent = 'Vorschau: ' + d; };
  img.onerror = () => { $('#lf-box').innerHTML = '<span class="muted small">Kein Logo gefunden</span>'; $('#lf-cap').textContent = d + ' hat bei Logo.dev kein Logo'; };
};
const logoSave = async (body, msg) => { try { await send('logo/override', body); closeSheet(); toast(msg); } catch (e) { toast(e.message); } };
ACT.logoApply = el => { const d = cleanDomain($('#lf-site').value); if (!d) return toast('Bitte eine Website eingeben'); logoSave({ site: el.dataset.site, use: d }, 'Logo übernommen'); };
ACT.logoNone = el => logoSave({ site: el.dataset.site, use: '' }, 'Logo ausgeblendet');
ACT.logoReset = el => logoSave({ site: el.dataset.site, reset: true }, 'Korrektur zurückgesetzt');

ACT.wish = async el => {
  const id = el.dataset.id, on = !wished(id);
  try { await send('wish', { user: me, beer: id, on }); haptic(12); toast(on ? 'Auf deine Merkliste gesetzt' : 'Von der Merkliste genommen'); } catch (e) { toast(e.message); }
};
ACT.cheers = async el => {
  el.disabled = true;
  try { const r = await send('cheers', { user: el.dataset.u, beer: el.dataset.b, session: el.dataset.s || null, by: me }); if (r.on) { haptic(18); toast('Prost an ' + el.dataset.u); } } catch (e) { toast(e.message); el.disabled = false; }
};

// ---------- Brauerei
function renderBrewery(r) {
  const name = r.id, list = D.beers.filter(b => shown(b) && b.brewery === name).map(b => ({ b, ...beerAgg(b.id) })).sort((a, c) => (c.avg ?? -1) - (a.avg ?? -1));
  if (!list.length) return emptyCard('', 'Brauerei nicht gefunden', 'Zu dieser Brauerei gibt es keine Biere im Bierbuch.', '<a class="btn primary" href="#/biere">Zu den Bieren</a>');
  const all = list.flatMap(x => Object.values(x.per).map(mean)), a = mean(all);
  const b0 = list[0].b, others = (CAT || []).filter(c => c.brewery === name && !list.some(x => beerKey(x.b.name) === beerKey(c.name)));
  return {
    title: name, html: `
    <div class="page-head">${thumb({ ...b0, name }, null, 'lg')}<div class="grow"><h1 class="large-title">${esc(name)}</h1><div class="small muted">${[countryText(b0.country), b0.site ? `<a href="https://${esc(b0.site)}" target="_blank" rel="noopener">${esc(b0.site)}</a>` : ''].filter(Boolean).join(' · ')}</div></div></div>
    <div class="kpis"><div class="kpi"><b>${list.length}</b><span>Biere probiert</span></div><div class="kpi"><b style="color:${scoreFg(a)}">${fmt(a, 1)}</b><span>Ø Note</span></div><div class="kpi"><b>${all.length}</b><span>Bewertungen</span></div></div>
    <div class="section-title">Im Bierbuch</div>
    <div class="list">${list.map(x => `<a class="item" href="${href('bier', x.b.id)}">${thumb(x.b)}<div class="grow"><h3>${esc(x.b.name)}</h3><div class="sub">${[x.b.style, x.b.abv != null && x.b.abv !== '' ? fmt(x.b.abv, 1) + ' %' : '', x.people ? x.people + '× bewertet' : ''].filter(Boolean).map(esc).join(' · ')}</div></div>${score(x.avg)}</a>`).join('')}</div>
    ${others.length ? `<div class="section-title">Noch nicht probiert</div><div class="list">${others.map(c => `<button class="item" data-act="add" data-name="${esc(c.name)}">${candThumb(c)}<div class="grow"><h3>${esc(c.name)}</h3><div class="sub">${candMeta({ ...c, brewery: '' })}</div></div><span class="chev">＋</span></button>`).join('')}</div>` : ''}`,
  };
}

ACT.addExisting = async el => {
  const live = liveTasting();
  try { await send('session/beers', { session: live.id, op: 'add', id: el.dataset.id }); toast('Zum Tasting hinzugefügt'); } catch (e) { toast(e.message); }
};
ACT.editBeer = el => {
  const b = beer(el.dataset.id);
  openSheet(head('Bier bearbeiten') + beerFields(b) + `<div class="savebar"><button class="btn primary block" data-act="saveBeer" data-id="${b.id}">Speichern</button></div>`);
};
ACT.saveBeer = async el => {
  const body = { id: el.dataset.id, ...readBeerFields() };
  if (!body.name) return toast('Name fehlt');
  try { await send('beer', body); closeSheet(); toast('Gespeichert'); } catch (e) { toast(e.message); }
};
ACT.deleteBeer = async el => {
  const n = D.ratings.filter(r => r.beer === el.dataset.id).length;
  if (!(await ask({ title: 'Bier löschen?', text: `Es verschwindet zusammen mit ${n} ${n === 1 ? 'Bewertung' : 'Bewertungen'}. 30 Tage lang kannst du es aus dem Papierkorb zurückholen.`, ok: 'Löschen', danger: true }))) return;
  try { const r = await send('beer/delete', { id: el.dataset.id, user: me }); go('#/biere'); undoToast('Bier gelöscht', r.tid); } catch (e) { toast(e.message); }
};
function beerFields(b = {}) {
  return `<label class="lbl" for="f-name">Name</label><input class="field" id="f-name" value="${esc(b.name)}" maxlength="120" autocomplete="off">
  <label class="lbl" for="f-brewery">Brauerei</label><input class="field" id="f-brewery" value="${esc(b.brewery)}" maxlength="120" autocomplete="off">
  <div class="grid2"><div><label class="lbl" for="f-style">Stil</label><input class="field" id="f-style" list="styles" value="${esc(b.style)}" maxlength="60" autocomplete="off"></div>
  <div><label class="lbl" for="f-abv">Alkohol %</label><input class="field" id="f-abv" inputmode="decimal" value="${b.abv != null && b.abv !== '' ? esc(fmt(b.abv, 1)) : ''}" maxlength="5"></div></div>
  <label class="lbl" for="f-barcode">Barcode (EAN)</label><input class="field" id="f-barcode" inputmode="numeric" value="${esc(b.barcode)}" maxlength="14">
  <label class="lbl" for="f-site">Website der Brauerei <span class="faint">(für das Logo)</span></label><input class="field" id="f-site" inputmode="url" value="${esc(b.site || '')}" maxlength="120" autocomplete="off" spellcheck="false" placeholder="z. B. rothaus.de">
  <datalist id="styles">${STYLES.map(x => `<option value="${x}">`).join('')}</datalist>`;
}
const readBeerFields = () => ({ name: $('#f-name').value.trim(), brewery: $('#f-brewery').value.trim(), style: $('#f-style').value.trim(), abv: $('#f-abv').value.trim(), barcode: $('#f-barcode').value.replace(/\D/g, ''), site: cleanDomain($('#f-site')?.value) });

// ---------- Leute
function renderPeople() {
  const ps = people().map(p => {
    const bs = personBeers(p), last = bs.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))[0];
    return { p, n: bs.length, a: mean(bs.map(x => x.v)), last };
  }).sort((a, b) => (b.last?.ts || '').localeCompare(a.last?.ts || '') || b.n - a.n);
  return {
    title: 'Leute', html: `${largeTitle('Leute', `${ps.length} ${ps.length === 1 ? 'Person' : 'Personen'} trinken mit`)}
    <div class="list" style="margin-top:16px">${ps.map(x => `<a class="item" href="${href('person', x.p)}">${avatar(x.p)}<div class="grow"><h3>${esc(x.p)}${x.p === me ? ' <span class="pill accent">Du</span>' : ''}</h3><div class="sub">${x.n ? `${x.n} ${x.n === 1 ? 'Bier' : 'Biere'}${x.last ? ` · zuletzt ${esc(x.last.b.name)}${x.last.ts ? ', ' + esc(ago(x.last.ts)) : ''}` : ''}` : 'Noch nichts bewertet'}</div></div>${x.n ? scoreCol(x.a, 'Ø') : ''}</a>`).join('') || '<div class="item plain muted">Noch niemand.</div>'}</div>
    <button class="btn block" style="margin-top:14px" data-act="invite">Leute einladen (QR-Code)</button>`,
  };
}
function renderPerson(r) {
  const p = r.id;
  if (!people().includes(p)) return emptyCard('🤷', 'Unbekannte Person', 'Diese Person gibt es hier nicht.', '<a class="btn primary" href="#/leute">Zu den Leuten</a>');
  const bs = personBeers(p);
  const all = D.ratings.filter(x => x.user === p && visible(x));
  const a = mean(bs.map(x => x.v));
  const styles = {};
  for (const x of bs) if (x.b.style) (styles[x.b.style] ||= []).push(x.v);
  const st = Object.entries(styles).map(([k, v]) => ({ k, n: v.length, a: mean(v) })).sort((x, y) => y.n - x.n || y.a - x.a);
  const fav = st.slice().sort((x, y) => (y.n >= 2) - (x.n >= 2) || y.a - x.a)[0];
  const hist = Array(11).fill(0);
  for (const x of bs) hist[Math.min(10, Math.floor(x.v))]++;
  const hmax = Math.max(1, ...hist);
  const tw = p !== me ? twins([me, p], () => true, 2)[0] : null;
  const tags = {};
  for (const x of all) for (const t of x.tags || []) tags[t] = (tags[t] || 0) + 1;
  const sorted = bs.slice().sort(personSort === 'best' ? (x, y) => y.v - x.v : (x, y) => (y.ts || '').localeCompare(x.ts || ''));
  const tastings = new Set(all.filter(x => x.session).map(x => x.session)).size;
  return {
    title: p, html: `
    <div class="page-head">${avatar(p, 'lg')}<div class="grow"><h1 class="large-title">${esc(p)}${p === me ? ` <button class="icon-btn inline" data-act="renameMe" aria-label="Namen ändern">${ICON.pen}</button>` : ''}</h1><div class="small muted">${bs.length ? `Zuletzt aktiv ${esc(ago(bs.map(x => x.ts || '').sort().at(-1)) || '–')}` : 'Noch nichts bewertet'}</div></div></div>
    <div class="kpis"><div class="kpi"><b>${bs.length}</b><span>Biere</span></div><div class="kpi"><b style="color:${scoreFg(a)}">${fmt(a, 1)}</b><span>Ø Note</span></div><div class="kpi"><b>${esc(fav?.k || '–')}</b><span>Lieblingsstil</span></div></div>
    ${tw ? `<div class="card" style="margin-top:12px"><div class="between"><div><b>Geschmacksverwandtschaft mit dir</b><div class="small muted">${tw.n} gemeinsame Biere</div></div><b class="title2" style="white-space:nowrap">${Math.round(Math.max(0, 100 - tw.diff * 10))} %</b></div><div class="meter" style="margin-top:10px"><i style="width:${Math.max(0, 100 - tw.diff * 10)}%"></i></div></div>` : ''}
    ${wishlist(p).length ? `<div class="section-title">Merkliste</div><div class="list">${wishlist(p).map(beer).filter(shown).map(b => `<a class="item" href="${href('bier', b.id)}">${thumb(b)}<div class="grow"><h3>${esc(b.name)}</h3><div class="sub">${meta(b) || '&nbsp;'}</div></div>${scoreCol(beerAgg(b.id).avg, beerAgg(b.id).people ? beerAgg(b.id).people + '×' : 'neu')}</a>`).join('')}</div>` : ''}
    ${bs.length ? `<div class="section-title">Biere</div>
    <div class="seg" style="margin-bottom:12px"><button class="${personSort === 'recent' ? 'on' : ''}" data-act="personSort" data-v="recent">Neueste</button><button class="${personSort === 'best' ? 'on' : ''}" data-act="personSort" data-v="best">Beste Note</button></div>
    <div class="list">${sorted.map(x => `<a class="item" href="${href('bier', x.b.id)}">${thumb(x.b)}<div class="grow"><h3>${esc(x.b.name)}${x.fav ? ' <span class="heart">♥</span>' : ''}</h3><div class="sub">${[ago(x.ts), x.n > 1 ? x.n + '× bewertet' : '', x.b.style].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div></div>${score(x.v)}</a>`).join('')}</div>
    <div class="section-title">Notenverteilung</div><div class="card"><div class="hist">${hist.map((n, i) => `<div><i style="height:${100 * n / hmax}%;background:${scoreBg(i + 0.5)}" title="${n}× ${i}"></i><small>${i}</small></div>`).join('')}</div></div>
    ${st.length ? `<div class="section-title">Nach Stil</div><div class="card">${st.map(x => `<div class="bar-row"><span class="ellipsis">${esc(x.k)} <span class="muted small">${x.n}×</span></span><div class="meter"><i style="width:${x.a * 10}%;background:${scoreBg(x.a)}"></i></div><b class="num small">${fmt(x.a, 1)}</b></div>`).join('')}</div>` : ''}
    ${Object.keys(tags).length ? `<div class="section-title">Eindrücke</div><div class="chips wrap">${Object.entries(tags).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<span class="chip">${esc(t)} <span class="n">${n}</span></span>`).join('')}</div>` : ''}
    ${tastings ? `<p class="small muted" style="margin-top:20px">Bei ${tastings} ${tastings === 1 ? 'Tasting' : 'Tastings'} dabei.</p>` : ''}`
      : emptyCard('🍺', 'Noch keine Biere', p === me ? 'Trag dein erstes Bier ein.' : `${esc(p)} hat noch nichts bewertet.`, p === me ? '<button class="btn primary" data-act="add">Bier eintragen</button>' : '')}`,
  };
}
ACT.personSort = el => { personSort = el.dataset.v; render(); };
ACT.renameMe = async () => {
  const name = ((await ask({ title: 'Namen ändern', text: 'Alle deine Bewertungen wandern mit.', ok: 'Ändern', input: { value: me, max: 40 } })) || '').trim().replace(/\s+/g, ' ');
  if (!name || name === me) return;
  try { await send('person/rename', { old: me, new: name }); me = name; LS.set('bs-user', me); go(href('person', me)); toast('Du heißt jetzt ' + me); } catch (e) { toast(e.message); }
};

// ---------- Tastings
function renderTastings() {
  const list = [...D.sessions].reverse();
  return {
    title: 'Tastings', html: `${largeTitle('Tastings', 'Gemeinsam dasselbe Bier bewerten, auf Wunsch blind.')}
    <button class="btn primary block" style="margin-top:16px" data-act="newSession">Neues Tasting starten</button>
    ${list.length ? `<div class="list" style="margin-top:16px">${list.map(s => { const n = D.ratings.filter(r => r.session === s.id).length; return `<a class="item" href="${href('tasting', s.id)}"><span class="thumb" style="background:${tone(s.name)};color:${toneInk(s.name)}">${ICON.cheers}</span><div class="grow"><h3>${esc(s.name)}</h3><div class="sub">${[dateDe(s.date), s.beers.length + ' Biere', n + ' Noten', s.closed ? 'abgeschlossen' : !s.reveal ? 'blind' : ''].filter(Boolean).join(' · ')}</div></div>${D.active === s.id && !s.closed ? '<span class="pill live">LIVE</span>' : ''}<span class="chev">›</span></a>`; }).join('')}</div>`
      : `<div style="margin-top:16px">${emptyCard('🍻', 'Noch kein Tasting', 'Leg eins an, lade deine Leute per QR-Code ein und setzt gemeinsam das nächste Bier „ins Glas“.')}</div>`}`,
  };
}
function selectedBeer(s) {
  let id = pick[s.id];
  if (!s.beers.includes(id)) id = s.current && s.beers.includes(s.current) ? s.current : s.beers.find(b => !own(s.id, b)) || s.beers[0];
  pick[s.id] = id;
  return id;
}
function renderTasting(r) {
  const s = sessionOf(r.id);
  if (!s) return emptyCard('🤷', 'Tasting nicht gefunden', 'Vielleicht wurde es gelöscht.', '<a class="btn primary" href="#/tastings">Zu den Tastings</a>');
  const total = s.beers.length * Math.max(1, s.people.length), done = D.ratings.filter(x => x.session === s.id).length;
  const status = s.closed ? '<span class="pill">Abgeschlossen</span>' : !s.reveal ? '<span class="pill accent">Blind</span>' : '';
  return {
    title: s.name, html: `
    <div class="between" style="align-items:flex-start;margin-top:6px"><div class="grow"><div class="row" style="gap:6px;min-height:22px">${D.active === s.id && !s.closed ? '<span class="pill live">LIVE</span>' : ''}${status}</div>
      <h1 class="large-title">${esc(s.name)}</h1><div class="small muted">${[dateDe(s.date), s.place && esc(s.place), `${s.people.length} dabei`, `${s.beers.length} ${s.beers.length === 1 ? 'Bier' : 'Biere'}`].filter(Boolean).join(' · ')}</div></div>
      <button class="icon-btn" data-act="sessionMenu" data-id="${s.id}" aria-label="Tasting-Optionen">${ICON.more}</button></div>
    <div class="seg" style="margin:16px 0"><button class="${tastingSeg === 'rate' ? 'on' : ''}" data-act="tSeg" data-v="rate">Bewerten</button><button class="${tastingSeg === 'res' ? 'on' : ''}" data-act="tSeg" data-v="res">Ergebnis${s.reveal ? '' : ' · blind'} <span class="tiny faint">${Math.round(100 * done / (total || 1))} %</span></button></div>
    ${tastingSeg === 'res' ? renderResults(s) : renderTastingRate(s)}`,
  };
}
ACT.tSeg = el => { tastingSeg = el.dataset.v; render(); };
function renderTastingRate(s) {
  if (!s.beers.length) return emptyCard('🍺', 'Noch keine Biere', 'Füge das erste Bier hinzu. Alle sehen es sofort auf ihrem Handy.', s.closed ? '' : `<button class="btn primary" data-act="addToSession" data-id="${s.id}">Bier hinzufügen</button>`);
  const id = selectedBeer(s), b = beer(id), idx = s.beers.indexOf(id);
  const raters = new Set(D.ratings.filter(x => x.session === s.id && x.beer === id).map(x => x.user));
  const ppl = [...new Set([...s.people, ...raters])];
  return `<div class="chips">${s.beers.map((x, i) => { const l = label(beer(x), s); return `<button class="chip ${x === id ? 'on' : ''}" data-act="pickBeer" data-s="${s.id}" data-id="${x}">${s.current === x ? '● ' : ''}${i + 1}. ${esc(l.length > 18 ? l.slice(0, 17) + '…' : l)}${own(s.id, x) ? ' ✓' : ''}</button>`; }).join('')}${s.closed ? '' : `<button class="chip" data-act="addToSession" data-id="${s.id}">＋ Bier</button>`}</div>
  <div class="card" style="margin-top:12px">
    <div class="row" style="gap:14px">${thumb(b, s, 'lg')}<div class="grow"><div class="row" style="gap:6px">${s.current === id ? '<span class="pill live">Im Glas</span>' : ''}<span class="pill">${idx + 1} von ${s.beers.length}</span></div>
      <h2 class="title2" style="margin:6px 0 2px">${esc(label(b, s))}</h2><div class="small muted">${meta(b) || 'Keine weiteren Infos'}</div></div></div>
    <div class="who">${ppl.map(p => `<span title="${esc(p)}">${avatar(p, 'sm ' + (raters.has(p) ? '' : 'off'))}</span>`).join('')}</div>
    <div class="between small muted" style="margin-top:8px"><span>${raters.size} von ${ppl.length} haben bewertet</span>${s.current !== id && !s.closed ? `<button class="btn ghost sm" data-act="setCurrent" data-s="${s.id}" data-id="${id}">Für alle ins Glas</button>` : ''}</div>
  </div>
  <div class="card">${rateForm('m', s.id, id)}</div>
  <div class="btns"><button class="btn" data-act="stepBeer" data-s="${s.id}" data-d="-1" ${idx === 0 ? 'disabled' : ''}>← Zurück</button><button class="btn" data-act="nextOpen" data-s="${s.id}">Nächstes offenes →</button></div>`;
}
function renderResults(s) {
  const rows = s.beers.map(id => {
    const vis = D.ratings.filter(x => x.session === s.id && x.beer === id && visible(x)), a = mean(vis.map(x => x.value));
    const sd = vis.length ? Math.sqrt(mean(vis.map(x => (x.value - a) ** 2))) : 0;
    return { b: beer(id), id, vis, a, sd, fav: vis.filter(x => x.favorite).length };
  });
  const ppl = [...new Set([...s.people, ...D.ratings.filter(x => x.session === s.id).map(x => x.user)])];
  if (!s.reveal) {
    return emptyCard('🙈', 'Noch verdeckt', 'Biernamen und fremde Noten bleiben geheim, bis ihr auflöst, auch technisch.', s.closed ? '' : `<button class="btn primary" data-act="reveal" data-id="${s.id}">Jetzt auflösen</button>`)
      + `<div class="section-title">Fortschritt</div><div class="card">${ppl.map(p => { const n = D.ratings.filter(x => x.session === s.id && x.user === p).length; return `<div class="bar-row"><span class="row" style="gap:8px">${avatar(p, 'sm')}<span class="ellipsis">${esc(p)}</span></span><div class="meter"><i style="width:${100 * n / (s.beers.length || 1)}%"></i></div><span class="num small">${n}/${s.beers.length}</span></div>`; }).join('')}</div>`;
  }
  const ranked = rows.filter(x => x.a != null).sort((a, b) => b.a - a.a);
  if (!ranked.length) return emptyCard('📊', 'Noch keine Noten', 'Sobald bewertet wird, entsteht hier die Rangliste.');
  const medal = ['1', '2', '3'];
  const podium = ranked.length >= 3 ? `<div class="podium">${[1, 0, 2].map(i => `<div class="p p${i + 1}"><div class="medal">${medal[i]}.</div><b style="color:${scoreFg(ranked[i].a)}">${fmt(ranked[i].a, 1)}</b><div class="nm">${esc(label(ranked[i].b, s))}</div></div>`).join('')}</div>` : '';
  const list = ranked.map((x, i) => `<a class="item" href="${href('bier', x.id)}"><span class="num faint" style="width:18px;text-align:center;font-weight:700">${i + 1}</span>
    <div class="grow"><h3>${esc(label(x.b, s))}</h3><div class="sub">${x.vis.length} Noten${x.fav ? ` · ♥ ${x.fav}` : ''}</div>
    <div class="strip">${x.vis.map(v => `<span class="pt" style="left:${v.value * 10}%;background:${toneDot(v.user)}" title="${esc(v.user)}: ${fmt(v.value)}"></span>`).join('')}<span class="avg" style="left:${x.a * 10}%"></span></div></div>${score(x.a)}</a>`).join('');
  const facts = [];
  const multi = ranked.filter(x => x.vis.length >= 3);
  const contro = [...multi].sort((a, b) => b.sd - a.sd)[0], agree = [...multi].sort((a, b) => a.sd - b.sd)[0];
  if (contro) facts.push(['', 'Am umstrittensten', `${label(contro.b, s)}: Noten von ${fmt(Math.min(...contro.vis.map(x => x.value)))} bis ${fmt(Math.max(...contro.vis.map(x => x.value)))}`]);
  if (agree && agree !== contro) facts.push(['', 'Größte Einigkeit', `${label(agree.b, s)}: Streuung nur ${fmt(agree.sd, 2)}`]);
  const pp = ppl.map(p => { const v = D.ratings.filter(x => x.session === s.id && x.user === p && visible(x)); return { p, n: v.length, a: mean(v.map(x => x.value)) }; }).filter(x => x.n >= 3).sort((a, b) => a.a - b.a);
  if (pp.length >= 2) { facts.push(['', 'Strengste Zunge', `${pp[0].p}: Ø ${fmt(pp[0].a, 2)}`]); facts.push(['', 'Großzügigste Zunge', `${pp.at(-1).p}: Ø ${fmt(pp.at(-1).a, 2)}`]); }
  const twin = twins(ppl, x => x.session === s.id, 3)[0];
  if (twin) facts.push(['', 'Geschmackszwillinge', `${twin.a} & ${twin.b}: im Schnitt nur ${fmt(twin.diff, 2)} auseinander`]);
  const matrix = `<div class="table-wrap"><table><thead><tr><th>Bier</th>${ppl.map(p => `<th title="${esc(p)}">${esc(initials(p))}</th>`).join('')}<th>Ø</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(label(x.b, s))}</td>${ppl.map(p => { const v = x.vis.find(y => y.user === p); return `<td style="color:${v ? scoreFg(v.value) : 'var(--faint)'};font-weight:650">${v ? fmt(v.value) + (v.favorite ? '♥' : '') : '–'}</td>`; }).join('')}<td><b>${fmt(x.a)}</b></td></tr>`).join('')}</tbody></table></div>`;
  return `${podium}<div class="list">${list}</div>
    ${facts.length ? `<div class="section-title">Gesprächsstoff</div><div class="list">${facts.map(([i, t, d]) => `<div class="item plain"><div class="grow"><h3>${esc(t)}</h3><div class="sub" style="white-space:normal">${esc(d)}</div></div></div>`).join('')}</div>` : ''}
    <div class="section-title">Alle Noten</div><div class="card">${matrix}<p class="tiny muted" style="margin:10px 0 0">${ppl.map(p => `${esc(initials(p))} = ${esc(p)}`).join(' · ')}</p></div>
    <a class="btn block" style="margin-top:14px" href="/api/csv?session=${s.id}&user=${encodeURIComponent(me)}" download>Als CSV exportieren</a>`;
}
ACT.pickBeer = el => { pick[el.dataset.s] = el.dataset.id; render(); };
ACT.stepBeer = el => { const s = sessionOf(el.dataset.s), i = s.beers.indexOf(pick[s.id]) + +el.dataset.d; if (s.beers[i]) { pick[s.id] = s.beers[i]; render(); } };
ACT.nextOpen = el => {
  const s = sessionOf(el.dataset.s), i = s.beers.indexOf(pick[s.id]);
  const n = [...s.beers.slice(i + 1), ...s.beers.slice(0, i)].find(b => !own(s.id, b));
  if (n) { pick[s.id] = n; render(); scrollTo({ top: 0, behavior: 'smooth' }); } else toast('Du hast alle Biere bewertet');
};
ACT.setCurrent = async el => { try { await send('session', { id: el.dataset.s, current: el.dataset.id }); haptic(); toast('Für alle ins Glas gesetzt'); } catch (e) { toast(e.message); } };
const askReveal = () => ask({ title: 'Für alle auflösen?', text: 'Biernamen und alle Noten werden für alle sichtbar.', ok: 'Auflösen' });
ACT.reveal = async el => { if (!(await askReveal())) return; try { await send('session', { id: el.dataset.id, reveal: true }); tastingSeg = 'res'; render(); haptic(40); } catch (e) { toast(e.message); } };
ACT.sessionMenu = el => {
  const s = sessionOf(el.dataset.id);
  const b = (act, t, extra = '') => `<button class="item plain" data-act="${act}" data-id="${s.id}" ${extra}><div class="grow"><h3>${t}</h3></div><span class="chev">›</span></button>`;
  openSheet(head(s.name) + `<div class="list">
    ${b('editSession', 'Name, Datum und Leute')}
    ${s.closed ? '' : b('addToSession', 'Bier hinzufügen')}
    ${b('invite', 'Leute einladen (QR-Code)')}
    ${b('manageBeers', 'Reihenfolge und Biere')}
    ${D.active === s.id ? '' : b('makeLive', 'Als LIVE-Tasting setzen')}
    ${s.closed ? '' : b('toggle', s.reveal ? 'Ab jetzt blind' : 'Jetzt auflösen', 'data-k="reveal"')}
    ${b('toggle', s.closed ? 'Wieder öffnen' : 'Abschließen', 'data-k="closed"')}</div>
    <div class="list"><button class="item plain" data-act="deleteSession" data-id="${s.id}"><div class="grow"><h3 style="color:var(--danger)">Tasting löschen</h3></div></button></div>`);
};
ACT.toggle = async el => {
  const s = sessionOf(el.dataset.id), k = el.dataset.k, v = !s[k];
  if (k === 'reveal' && v && !(await askReveal())) return;
  try { await send('session', { id: s.id, [k]: v }); closeSheet(); toast('Gespeichert'); } catch (e) { toast(e.message); }
};
ACT.makeLive = async el => { try { await send('active', { id: el.dataset.id }); closeSheet(); toast('Ist jetzt das LIVE-Tasting'); } catch (e) { toast(e.message); } };
ACT.deleteSession = async el => {
  const s = sessionOf(el.dataset.id);
  if (!(await ask({ title: 'Tasting löschen?', text: `„${s.name}“ mit allen ${D.ratings.filter(r => r.session === s.id).length} Bewertungen. Die Biere bleiben. 30 Tage im Papierkorb.`, ok: 'Löschen', danger: true }))) return;
  try { const r = await send('session/delete', { id: s.id, user: me }); go('#/tastings'); undoToast('Tasting gelöscht', r.tid); } catch (e) { toast(e.message); }
};
function sessionForm(s) {
  const isNew = !s;
  s = s || { name: '', date: new Date().toISOString().slice(0, 10), place: '', people: me ? [me] : [], reveal: true };
  const all = [...new Set([...people(), ...s.people])];
  openSheet(head(isNew ? 'Neues Tasting' : 'Tasting bearbeiten') + `
    <label class="lbl" for="s-name">Name</label><input class="field" id="s-name" value="${esc(s.name)}" placeholder="z. B. Pils-Battle bei Alex" maxlength="120">
    <div class="grid2"><div><label class="lbl" for="s-date">Datum</label><input class="field" id="s-date" type="date" value="${esc(s.date)}"></div>
    <div><label class="lbl" for="s-place">Ort</label><input class="field" id="s-place" value="${esc(s.place)}" maxlength="120"></div></div>
    <label class="lbl">Wer ist dabei?</label><div class="chips wrap" id="s-people">${all.map(p => `<button class="chip ${s.people.includes(p) ? 'on' : ''}" data-act="togglePerson" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><input class="field" id="s-newp" placeholder="Weitere Person" maxlength="40"><button class="btn" data-act="addPersonChip">＋</button></div>
    ${isNew ? `<label class="switch"><span><b>Blindverkostung</b><br><span class="small muted">Biernamen und fremde Noten bleiben verdeckt, bis ihr auflöst.</span></span><input type="checkbox" id="s-blind"></label>` : ''}
    <div class="savebar"><button class="btn primary block" data-act="saveSession" data-id="${isNew ? '' : s.id}">${isNew ? 'Tasting starten' : 'Speichern'}</button></div>`);
}
ACT.newSession = () => sessionForm(null);
ACT.editSession = el => sessionForm(sessionOf(el.dataset.id));
ACT.togglePerson = el => el.classList.toggle('on');
ACT.addPersonChip = () => {
  const v = $('#s-newp').value.trim().slice(0, 40);
  if (!v) return;
  const c = document.createElement('button');
  c.className = 'chip on'; c.dataset.act = 'togglePerson'; c.dataset.v = v; c.textContent = v;
  $('#s-people').append(c); $('#s-newp').value = '';
};
ACT.saveSession = async el => {
  const body = { name: $('#s-name').value || 'Tasting', date: $('#s-date').value, place: $('#s-place').value, people: $$('#s-people .chip.on').map(c => c.dataset.v) };
  const isNew = !el.dataset.id;
  if (isNew) Object.assign(body, { new: true, activate: true, reveal: !$('#s-blind').checked }); else body.id = el.dataset.id;
  try { const r = await send('session', body); tastingSeg = 'rate'; go(href('tasting', r.id)); toast(isNew ? 'Tasting gestartet' : 'Gespeichert'); }
  catch (e) { toast(e.message); }
};
ACT.manageBeers = el => {
  const s = sessionOf(el.dataset.id);
  openSheet(head('Biere im Tasting') + `<div class="list">${s.beers.map((id, i) => `<div class="item plain"><span class="num faint" style="width:18px">${i + 1}</span><div class="grow"><h3>${esc(label(beer(id), s))}</h3></div>
    <button class="icon-btn" data-act="moveBeer" data-s="${s.id}" data-id="${id}" data-d="-1" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-act="moveBeer" data-s="${s.id}" data-id="${id}" data-d="1" aria-label="Nach unten" ${i === s.beers.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-btn" data-act="removeBeer" data-s="${s.id}" data-id="${id}" aria-label="Entfernen" style="color:var(--danger)">✕</button></div>`).join('') || '<div class="item plain muted">Noch keine Biere.</div>'}</div>`);
};
ACT.moveBeer = async el => { try { await send('session/beers', { session: el.dataset.s, op: 'move', id: el.dataset.id, dir: +el.dataset.d }); ACT.manageBeers({ dataset: { id: el.dataset.s } }); } catch (e) { toast(e.message); } };
ACT.removeBeer = async el => { if (!(await ask({ title: 'Aus dem Tasting entfernen?', text: 'Das Bier bleibt im Bierbuch.', ok: 'Entfernen', danger: true }))) return; try { await send('session/beers', { session: el.dataset.s, op: 'remove', id: el.dataset.id }); ACT.manageBeers({ dataset: { id: el.dataset.s } }); } catch (e) { toast(e.message); } };

// ---------- Einladen
ACT.invite = el => {
  const sid = el?.dataset?.id;
  const base = (LS.get('bs-base', '') || location.origin).replace(/\/$/, '');
  const url = base + '/' + (sid ? '#/tasting/' + sid : '');
  let svg = '';
  try { const q = qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { }
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  openSheet(head('Leute einladen') + `<p class="sheet-sub" style="text-align:center">Mit der Handykamera scannen, im selben WLAN bzw. VPN.</p>
    <div class="qr">${svg}</div><p class="url">${esc(url)}</p>
    <div class="btns">${navigator.share ? '<button class="btn" data-act="shareLink">Teilen</button>' : ''}<button class="btn" data-act="copyLink">Link kopieren</button></div>
    <details class="more" ${local ? 'open' : ''}><summary>Adresse anpassen</summary>${local ? '<p class="small" style="color:var(--danger)">Du nutzt „localhost“. Andere Geräte erreichen das nicht. Trag die Adresse deines Servers ein, z. B. https://bier.example.de</p>' : ''}
    <div class="row"><input class="field" id="base-url" value="${esc(LS.get('bs-base', ''))}" placeholder="${esc(location.origin)}" inputmode="url"><button class="btn" data-act="saveBase" data-id="${sid || ''}">OK</button></div></details>`);
  ACT.copyLink = async () => { try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch { toast('Kopieren nicht möglich'); } };
  ACT.shareLink = () => navigator.share({ title: 'Bierstudio', text: 'Trink mit!', url }).catch(() => { });
};
ACT.saveBase = el => { LS.set('bs-base', $('#base-url').value.trim()); ACT.invite(el); };

// ------------------------------------------------------------------ Bewertungsformular
const dkey = (s, b) => `${s || 'solo'}:${b}:${me}`;
function draftFor(s, b) {
  const k = dkey(s, b);
  if (!drafts[k]) {
    const r = own(s, b), empty = Object.fromEntries(CATS.map(c => [c, null]));
    drafts[k] = r ? { mode: r.detail ? 'detail' : 'quick', value: r.value, detail: r.detail ? { ...r.detail } : empty, tags: [...(r.tags || [])], note: r.note || '', favorite: !!r.favorite, serving: r.serving || '', place: r.place || '', photo: r.photo || '', dirty: false }
      : { mode: LS.get('bs-mode', 'quick'), value: null, detail: empty, tags: [], note: '', favorite: false, serving: LS.get('bs-serving', ''), place: '', photo: '', dirty: false };
  }
  return drafts[k];
}
const saveDrafts = () => LS.set('bs-drafts', Object.fromEntries(Object.entries(drafts).filter(([, v]) => v.dirty)));
function draftValue(d) {
  if (d.mode === 'detail') return CATS.some(c => d.detail[c] == null) ? null : CATS.reduce((a, c) => a + d.detail[c] * W[c], 0) / 6 * 2;
  return d.value;
}
function saveLabel(f, d) {
  if (sessionOf(f.s)?.closed) return 'Tasting ist abgeschlossen';
  if (draftValue(d) == null) return d.mode === 'detail' ? 'Alle fünf Kategorien bewerten' : 'Note wählen';
  return own(f.s, f.b) ? (d.dirty ? 'Änderung speichern' : 'Gespeichert ✓') : 'Speichern';
}
function rateForm(p, s, b, opt = {}) {
  const f = forms[p] = { s, b, ...opt };
  const d = draftFor(s, b), v = draftValue(d), ex = own(s, b), closed = !!sessionOf(s)?.closed;
  const quick = `<input type="range" class="slider ${d.value == null ? 'unset' : ''}" id="${p}-range" min="0" max="10" step="0.1" value="${d.value ?? 5}" data-on="range" data-change="rangeDone" data-p="${p}" style="--p:${(d.value ?? 0) * 10}%;--c:${scoreFg(d.value ?? 5)}" aria-label="Note von 0 bis 10">
    <div class="scale"><span>0</span><span>5</span><span>10</span></div>
    <div class="steps">${[-0.5, -0.1, 0.1, 0.5].map(x => `<button data-act="rf" data-p="${p}" data-k="step" data-v="${x}" aria-label="${x > 0 ? 'plus' : 'minus'} ${fmt(Math.abs(x), 1)}">${x > 0 ? '+' : '−'}${fmt(Math.abs(x), 1)}</button>`).join('')}</div>`;
  const detail = CATS.map(c => `<div class="cat"><span>${c}${W[c] > 1 ? ' <small>×2</small>' : ''}</span><div class="five">${[1, 2, 3, 4, 5].map(n => `<button class="${d.detail[c] === n ? 'on' : ''}" data-act="rf" data-p="${p}" data-k="cat" data-c="${c}" data-v="${n}" aria-label="${c} ${n}">${n}</button>`).join('')}</div></div>`).join('') +
    '<p class="tiny muted">1 = schwach, 5 = hervorragend. Geschmack zählt doppelt.</p>';
  return `<div id="rf-${p}">
    <div class="rate-head"><button data-act="rfExact" data-p="${p}" aria-label="Note eintippen"><span class="big-score ${v == null ? 'unset' : ''}" id="${p}-score" style="${v == null ? '' : 'color:' + scoreFg(v)}">${v == null ? '–' : fmt(v, 1)}</span><span class="of10">/10</span></button>
    <div class="verdict" id="${p}-verdict">${verdict(v)}</div></div>
    ${d.mode === 'quick' ? quick : detail}
    <div class="seg" style="margin-top:16px"><button class="${d.mode === 'quick' ? 'on' : ''}" data-act="rf" data-p="${p}" data-k="mode" data-v="quick">Schnell</button><button class="${d.mode === 'detail' ? 'on' : ''}" data-act="rf" data-p="${p}" data-k="mode" data-v="detail">Detailliert</button></div>
    <div class="rf-photo">${d.photo ? `<img src="${photoUrl(d.photo)}" alt="Dein Foto"><button class="icon-btn" data-act="rf" data-p="${p}" data-k="nophoto" aria-label="Foto entfernen">${ICON.close}</button>`
      : `<label class="photo-add"><input type="file" accept="image/*" capture="environment" data-change="photo" data-p="${p}" hidden>${ICON.camera}<span id="${p}-photo-lbl">Foto hinzufügen</span></label>`}</div>
    <div class="seg serving">${SERVINGS.map(x => `<button class="${d.serving === x ? 'on' : ''}" data-act="rf" data-p="${p}" data-k="serving" data-v="${x}">${x}</button>`).join('')}</div>
    <details class="more" ${d.tags.length || d.note || d.place ? 'open' : ''}><summary>Eindruck, Notiz und Ort</summary>
    <div class="chips wrap" style="margin-top:6px">${[...new Set([...TAGS, ...d.tags])].map(t => `<button class="chip ${d.tags.includes(t) ? 'on' : ''}" data-act="rf" data-p="${p}" data-k="tag" data-v="${esc(t)}">${esc(t)}</button>`).join('')}<button class="chip" data-act="rf" data-p="${p}" data-k="newtag" aria-label="Eigener Eindruck">＋</button></div>
    <textarea class="field" id="${p}-note" data-on="note" data-p="${p}" rows="2" maxlength="1000" placeholder="Was bleibt hängen?" style="margin-top:12px">${esc(d.note)}</textarea>
    <input class="field" id="${p}-place" data-on="place" data-p="${p}" maxlength="80" placeholder="Wo? (Kneipe, Ort …)" value="${esc(d.place)}" style="margin-top:10px" autocomplete="off"></details>
    <div class="between" style="margin-top:12px">
      <button class="fav ${d.favorite ? 'on' : ''}" data-act="rf" data-p="${p}" data-k="fav">${d.favorite ? '♥' : '♡'} ${s ? 'Favorit des Abends' : 'Lieblingsbier'}</button>
      ${ex && !closed ? `<button class="btn ghost danger sm" data-act="rfDelete" data-p="${p}">Note löschen</button>` : ''}</div>
    <div class="${opt.sticky ? 'savebar' : ''}" style="${opt.sticky ? '' : 'margin-top:16px'}"><button class="btn primary block" id="${p}-save" data-act="rfSave" data-p="${p}" ${v == null || closed || (ex && !d.dirty) ? 'disabled' : ''}>${saveLabel(f, d)}</button></div>
  </div>`;
}
function rfRerender(p) { const f = forms[p], el = document.getElementById('rf-' + p); if (el) el.outerHTML = rateForm(p, f.s, f.b, f); }
function rfLive(p) {
  const f = forms[p], d = draftFor(f.s, f.b), v = draftValue(d);
  const sc = document.getElementById(p + '-score'), r = document.getElementById(p + '-range'), btn = document.getElementById(p + '-save');
  if (sc) { sc.textContent = v == null ? '–' : fmt(v, 1); sc.style.color = v == null ? '' : scoreFg(v); sc.classList.toggle('unset', v == null); }
  document.getElementById(p + '-verdict').textContent = verdict(v);
  if (r) { r.classList.toggle('unset', d.value == null); r.style.setProperty('--p', (d.value ?? 0) * 10 + '%'); r.style.setProperty('--c', scoreFg(d.value ?? 5)); }
  if (btn) { btn.disabled = v == null || !!sessionOf(f.s)?.closed || (own(f.s, f.b) && !d.dirty); btn.textContent = saveLabel(f, d); }
}
let lastTick = null;
ON.range = el => {
  const p = el.dataset.p, f = forms[p], d = draftFor(f.s, f.b);
  d.value = +el.value; d.dirty = true;
  const tick = Math.round(d.value);
  if (tick !== lastTick) { lastTick = tick; haptic(4); }
  rfLive(p);
};
CH.rangeDone = () => saveDrafts();
ON.place = el => { const p = el.dataset.p, f = forms[p], d = draftFor(f.s, f.b); d.place = el.value; d.dirty = true; saveDrafts(); rfLive(p); };
/** Foto: auf dem Gerät auf max. 1200 px verkleinern, dann hochladen. */
CH.photo = async el => {
  const p = el.dataset.p, f = forms[p], d = draftFor(f.s, f.b), file = el.files[0], lbl = document.getElementById(p + '-photo-lbl');
  if (!file) return;
  if (lbl) lbl.textContent = 'Lädt hoch …';
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const sc = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const r = await http('/api/photo', { data: c.toDataURL('image/jpeg', 0.82) });
    d.photo = r.id; d.dirty = true; saveDrafts(); haptic(15); rfRerender(p);
  } catch (e) { toast(e.server ? e.message : 'Foto konnte nicht hochgeladen werden'); if (lbl) lbl.textContent = 'Foto hinzufügen'; }
};
ON.note = el => { const p = el.dataset.p, f = forms[p], d = draftFor(f.s, f.b); d.note = el.value; d.dirty = true; saveDrafts(); rfLive(p); };
ACT.rf = async el => {
  const p = el.dataset.p, f = forms[p], d = draftFor(f.s, f.b), k = el.dataset.k;
  if (k === 'mode') { d.mode = el.dataset.v; LS.set('bs-mode', d.mode); }
  if (k === 'step') d.value = clamp(round((d.value ?? 5) + +el.dataset.v, 1));
  if (k === 'cat') d.detail[el.dataset.c] = +el.dataset.v;
  if (k === 'tag') d.tags = d.tags.includes(el.dataset.v) ? d.tags.filter(x => x !== el.dataset.v) : [...d.tags, el.dataset.v];
  if (k === 'newtag') { const t = ((await ask({ title: 'Eigener Eindruck', ok: 'Hinzufügen', input: { placeholder: 'z. B. karamellig', max: 24 } })) || '').trim().slice(0, 24); if (!t) return; if (!d.tags.includes(t)) d.tags.push(t); }
  if (k === 'fav') d.favorite = !d.favorite;
  if (k === 'serving') { d.serving = d.serving === el.dataset.v ? '' : el.dataset.v; LS.set('bs-serving', d.serving); }
  if (k === 'nophoto') d.photo = '';
  d.dirty = true; saveDrafts(); haptic();
  if (k === 'step') { const r = document.getElementById(p + '-range'); if (r) r.value = d.value; rfLive(p); } else rfRerender(p);
};
ACT.rfExact = async el => {
  const p = el.dataset.p, f = forms[p], d = draftFor(f.s, f.b);
  const x = await ask({ title: 'Note eintippen', text: 'Von 0 bis 10, Komma erlaubt.', ok: 'Übernehmen', input: { value: d.value == null ? '' : fmt(d.value, 2), mode: 'decimal', max: 5 } });
  if (x == null) return;
  const n = Number(x.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10) return toast('Bitte eine Zahl zwischen 0 und 10');
  d.mode = 'quick'; d.value = round(n, 2); d.dirty = true; saveDrafts(); rfRerender(p);
};
ACT.rfSave = async el => {
  const p = el.dataset.p, f = forms[p], k = dkey(f.s, f.b), d = drafts[k], v = draftValue(d);
  if (v == null) return;
  el.disabled = true; el.textContent = 'Speichert …';
  const body = { beer: f.b, user: me, session: f.s || null, value: round(v, 2), detail: d.mode === 'detail' ? d.detail : null, tags: d.tags, note: d.note, favorite: d.favorite, serving: d.serving || '', place: d.place || '', photo: d.photo || '', ts: new Date().toISOString() };
  delete drafts[k]; saveDrafts();
  try {
    const r = await send('rate', body, { queue: true, apply: () => applyRate(body) });
    haptic(25); toast(r.queued ? 'Offline gespeichert, wird synchronisiert' : `${fmt(v, 1)} für ${label(beer(f.b), sessionOf(f.s))} gespeichert`);
    if (f.onSaved) f.onSaved(); else render();
  } catch (e) { drafts[k] = d; saveDrafts(); toast(e.message); rfRerender(p); }
};
ACT.rfDelete = async el => {
  const f = forms[el.dataset.p];
  if (!(await ask({ title: 'Note löschen?', text: 'Deine Bewertung für dieses Bier wird entfernt.', ok: 'Löschen', danger: true }))) return;
  const body = { beer: f.b, user: me, session: f.s || null };
  try {
    const r = await send('rating/delete', body, { queue: true, apply: () => { D.ratings = D.ratings.filter(x => !(x.user === me && x.beer === f.b && ctxEq(x.session, f.s))); } });
    delete drafts[dkey(f.s, f.b)]; saveDrafts(); undoToast('Note gelöscht', r.tid);
    if (f.onSaved) f.onSaved(); else render();
  } catch (e) { toast(e.message); }
};
/** Bewerten im Sheet – solo oder im LIVE-Tasting. */
function rateSheet(id, sid = null) {
  const b = beer(id);
  if (!b) return;
  const s = sessionOf(sid);
  openSheet(head(label(b, s)) + `<p class="sheet-sub">${s ? 'Im Tasting „' + esc(s.name) + '“' : meta(b) || 'Solo-Bewertung'}</p>` + rateForm('s', sid, id, { sticky: true, onSaved: () => closeSheet() }));
}
ACT.rate = el => rateSheet(el.dataset.id, null);

// ------------------------------------------------------------------ Bier eintragen
let addState = null;
ACT.add = el => {
  if (!me) return go('#/');
  const live = liveTasting();
  addState = { q: el?.dataset?.name || '', session: live && live.people.includes(me) && route().page === 'tasting' ? live.id : null, cat: [], web: [], forSession: null };
  addSheet();
};
ACT.addToSession = el => { addState = { q: '', session: el.dataset.id, cat: [], web: [], forSession: el.dataset.id }; addSheet(); };
function addSheet() {
  const st = addState, live = liveTasting(), s = sessionOf(st.forSession);
  const canScan = 'BarcodeDetector' in window && isSecureContext && navigator.mediaDevices;
  const ctx = !s && live && route().page === 'tasting' ? `<div class="seg ctx"><button class="${!st.session ? 'on' : ''}" data-act="addCtx" data-v="">Einfach so</button><button class="${st.session ? 'on' : ''}" data-act="addCtx" data-v="${live.id}">${esc(live.name.length > 20 ? live.name.slice(0, 19) + '…' : live.name)}</button></div>` : '';
  openSheet(head(s ? 'Bier zum Tasting' : 'Was trinkst du?') + ctx + `
    <div class="add-input"><div class="row"><div class="search grow">${ICON.search}<input class="field" id="f-q" placeholder="Name, Brauerei oder Barcode" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" data-on="addQ" value="${esc(st.q)}" maxlength="120"></div>
    ${canScan ? `<button class="icon-btn" data-act="scan" aria-label="Barcode scannen" style="width:50px;height:50px;border-radius:14px">${ICON.scan}</button>` : ''}</div></div>
    <div id="a-res"></div><div id="a-web"></div>`);
  addResults();
  setTimeout(() => $('#f-q')?.focus(), 380);
}
ACT.addCtx = el => { addState.session = el.dataset.v || null; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); };
ON.addQ = el => { addState.q = el.value; addState.web = []; $('#a-web').innerHTML = ''; addResults(); };
function addResults() {
  const box = $('#a-res');
  if (!box) return;
  const q = addState.q.trim(), isCode = /^\d{8,14}$/.test(q);
  const row = (act, attrs, th, title, sub, right = '<span class="chev">›</span>') => `<button class="item" data-act="${act}" ${attrs}>${th}<div class="grow"><h3>${title}</h3><div class="sub">${sub || '&nbsp;'}</div></div>${right}</button>`;
  const group = (t, rows) => rows ? `<div class="result-group"><div class="eyebrow">${t}</div><div class="list">${rows}</div></div>` : '';
  if (!q) {
    const mine = personBeers(me).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 5);
    const pop = D.beers.filter(shown).map(b => ({ b, ...beerAgg(b.id), last: lastTs(b.id) })).filter(x => !mine.some(m => m.b.id === x.b.id)).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 6);
    box.innerHTML = group('Zuletzt von dir', mine.map(x => row('addPick', `data-id="${x.b.id}"`, thumb(x.b), esc(x.b.name), meta(x.b), scoreCol(x.v, 'ich'))).join(''))
      + group('Kürzlich bei den anderen', pop.map(x => row('addPick', `data-id="${x.b.id}"`, thumb(x.b), esc(x.b.name), meta(x.b), scoreCol(x.avg))).join(''))
      + (mine.length || pop.length ? '' : '<p class="small muted" style="text-align:center;margin:26px 0">Tipp einfach den Namen ein. Spitznamen wie „Zäpfle“ oder „Sterni“ kennt die App auch.</p>');
    return;
  }
  const local = searchLocal(q);
  addState.cat = searchCatalog(q);
  const exact = local.some(x => x.s >= 1.5);
  box.innerHTML = group('Im Bierbuch', local.map(x => { const ag = beerAgg(x.b.id); return row('addPick', `data-id="${x.b.id}"`, thumb(x.b), esc(x.b.name), meta(x.b), scoreCol(ag.avg, ag.people ? ag.people + '×' : '')); }).join(''))
    + group('Bekannte Biere', addState.cat.map((c, i) => row('addCat', `data-i="${i}"`, candThumb(c), esc(c.name), candMeta(c), '<span class="chev">＋</span>')).join(''))
    + (exact || isCode ? '' : group(local.length || addState.cat.length ? 'Nicht dabei?' : 'Neu', row('addNew', 'class="new-row"', '<span class="thumb">＋</span>', `„${esc(q)}“ neu eintragen`, 'Details kannst du gleich oder später ergänzen')))
    + (q.length >= 3 ? `<button class="btn ghost block" data-act="worldSearch" style="margin-top:10px">${isCode ? 'Barcode' : '„' + esc(q) + '“'} weltweit suchen</button>` : '');
}
/** Kontext prüfen und dann bewerten. */
async function rateAfterAdd(id) {
  const sid = addState?.session || null;
  if (sid) {
    const s = sessionOf(sid);
    if (s && !s.beers.includes(id)) { try { await send('session/beers', { session: sid, op: 'add', id }); } catch (e) { toast(e.message); } }
    if (addState.forSession) {
      if (!s.current) await send('session', { id: sid, current: id }).catch(() => { });
      pick[sid] = id; closeSheet(); toast('Zum Tasting hinzugefügt'); go(href('tasting', sid)); return;
    }
    pick[sid] = id;
  }
  haptic(15);
  rateSheet(id, sid);
}
ACT.addPick = el => rateAfterAdd(el.dataset.id);
async function createBeer(fields, extra = {}) {
  const body = { id: hex16(), ...fields, ...extra, user: me, session: addState?.session || null };
  const r = await send('beer', body, {
    queue: true, offlineBody: { force_new: true },
    apply: () => { D.beers.push({ ...body, abv: fields.abv ? +String(fields.abv).replace(',', '.') : null, created_at: new Date().toISOString(), created_by: me }); const s = sessionOf(body.session); if (s && !s.beers.includes(body.id)) s.beers.push(body.id); },
  });
  return r.id || body.id;
}
ACT.addCat = async el => {
  const c = addState.cat[+el.dataset.i];
  el.disabled = true;
  try { const id = await createBeer({ name: c.name, ...candFields(c) }); rateAfterAdd(id); } catch (e) { toast(e.message); el.disabled = false; }
};
ACT.addNew = () => newBeerForm({ name: addState.q.trim() });
function newBeerForm(c, extra = {}) {
  addState.extra = extra;
  // Ähnliche Biere zeigen, bevor ein Doppel entsteht
  const probe = { name: c.name, brewery: c.brewery || '', barcode: c.barcode || '' };
  const near = D.beers.filter(shown).map(b => ({ b, s: sameBeer(probe, b) })).filter(x => x.s >= 0.72).sort((a, b) => b.s - a.s).slice(0, 3);
  const cat = catBest(c.name);
  const f = { name: c.name, brewery: c.brewery ?? cat?.brewery ?? '', style: c.style ?? cat?.style ?? '', abv: c.abv ?? cat?.abv ?? '', barcode: c.barcode || '' };
  if (cat && !c.source) addState.extra = { ...extra, country: countryCode(cat.country), site: cat.site, source: 'katalog' };
  openSheet(head('Neues Bier') + (near.length ? `<div class="result-group"><div class="eyebrow">Meinst du eins davon?</div><div class="list">${near.map(x => `<button class="item" data-act="addPick" data-id="${x.b.id}">${thumb(x.b)}<div class="grow"><h3>${esc(x.b.name)}</h3><div class="sub">${meta(x.b) || '&nbsp;'}</div></div><span class="chev">›</span></button>`).join('')}</div></div>` : '')
    + (cat ? `<p class="small muted" style="margin:12px 2px 0">✓ Erkannt als <b>${esc(cat.name)}</b>, Angaben sind schon ausgefüllt.</p>` : '')
    + beerFields(f) + `<div class="savebar"><button class="btn primary block" data-act="saveNew">Weiter zur Bewertung</button></div>`);
  if (!cat) setTimeout(() => $('#f-brewery')?.focus(), 380);
}
ACT.saveNew = async el => {
  const f = readBeerFields();
  if (!f.name) { $('#f-name').focus(); return toast('Wie heißt das Bier?'); }
  el.disabled = true;
  try { const id = await createBeer(f, addState.extra || {}); rateAfterAdd(id); } catch (e) { toast(e.message); el.disabled = false; }
};
ACT.worldSearch = async () => {
  const q = addState.q.trim(), box = $('#a-web'), code = /^\d{8,14}$/.test(q);
  box.innerHTML = '<p class="small muted" style="text-align:center;margin:16px">Suche bei Wikidata und Open Food Facts …</p>';
  try {
    const r = code ? await http('/api/off/barcode?code=' + q).then(x => ({ results: x.products.map(offToCand), notes: x.notes || [] })) : await http('/api/lookup?q=' + encodeURIComponent(q));
    addState.web = r.results;
    box.innerHTML = (r.results.length ? `<div class="result-group"><div class="eyebrow">Weltweit gefunden</div><div class="list">` + r.results.map((c, i) => `<button class="item" data-act="addWeb" data-i="${i}">${candThumb(c)}<div class="grow"><h3>${esc(c.name)}</h3><div class="sub">${candMeta(c) || '&nbsp;'}</div><div class="tiny faint">${SRC[c.source] || ''}</div></div><span class="chev">＋</span></button>`).join('') + '</div></div>'
      : '<p class="small muted" style="text-align:center">Nichts gefunden. Trag das Bier einfach selbst ein.</p>') + r.notes.map(n => `<p class="tiny muted">${esc(n)}</p>`).join('');
  } catch (e) { box.innerHTML = `<p class="small" style="color:var(--danger)">${esc(e.server ? e.message : 'Keine Verbindung zum Server')}</p>`; }
};
ACT.addWeb = el => {
  const c = addState.web[+el.dataset.i];
  const local = c.barcode && D.beers.find(b => b.barcode === c.barcode && shown(b));
  if (local) { toast('Schon im Bierbuch'); return rateAfterAdd(local.id); }
  newBeerForm(c, { country: countryCode(c.country), site: c.site || '', image: c.image || '', source: c.source });
};
// ---------- Barcode-Scanner (Android/Chrome mit HTTPS)
ACT.scan = async () => {
  const box = $('#a-web');
  try {
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    box.innerHTML = '<video class="scan" id="scan-video" playsinline muted></video><button class="btn block" data-act="stopScan" style="margin-top:8px">Abbrechen</button>';
    const v = $('#scan-video'); v.srcObject = scanStream; await v.play();
    const loop = async () => {
      if (!scanStream) return;
      try {
        const [c] = await det.detect(v);
        if (c?.rawValue) { stopScan(); haptic(40); $('#f-q').value = addState.q = c.rawValue; addResults(); const loc = D.beers.find(b => b.barcode === c.rawValue && shown(b)); if (loc) rateAfterAdd(loc.id); else if (catByCode(c.rawValue)) toast('Im Katalog gefunden'); else ACT.worldSearch(); return; }
      } catch { }
      setTimeout(loop, 250);
    };
    loop();
  } catch (e) { stopScan(); box.innerHTML = `<p class="small muted">Kamera nicht verfügbar (${esc(e.name || e.message)}). Barcode einfach eintippen.</p>`; }
};
function stopScan() { if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; const v = $('#scan-video'); if (v) v.parentElement.innerHTML = ''; } }
ACT.stopScan = stopScan;

// ------------------------------------------------------------------ Infos ergänzen & Zusammenführen
let enrichState = null;
async function enrichSheet(id, web = null, notes = []) {
  const b = beer(id);
  if (!b) return closeSheet();
  await catalog();
  const cat = (CAT || []).map(c => [catSim(b.name, c, false), c]).filter(x => x[0] >= 0.55).sort((a, c) => c[0] - a[0]).slice(0, 5).map(x => x[1]);
  enrichState = { id, cands: [...cat, ...(web || [])] };
  openSheet(head('Infos ergänzen') + `<p class="sheet-sub">Tippe auf den passenden Eintrag. Brauerei, Stil, Alkohol und Land werden übernommen.</p>
    <label class="switch" style="padding-top:0"><span>Auch den offiziellen Namen übernehmen</span><input type="checkbox" id="en-name"></label>
    <div class="list">${enrichState.cands.map((c, i) => `<button class="item" data-act="applyCand" data-i="${i}">${candThumb(c)}<div class="grow"><h3>${esc(c.name)}</h3><div class="sub">${candMeta(c) || '&nbsp;'}</div><div class="tiny faint">${SRC[c.source] || ''}</div></div><span class="chev">›</span></button>`).join('') || '<div class="item plain muted">Kein Treffer im Katalog.</div>'}</div>
    ${notes.map(n => `<p class="tiny muted">${esc(n)}</p>`).join('')}
    ${web ? '' : `<button class="btn block" style="margin-top:12px" data-act="enrichWeb" data-id="${id}">Weltweit suchen</button>`}`);
}
ACT.enrich = el => enrichSheet(el.dataset.id);
ACT.enrichWeb = async el => {
  const id = el.dataset.id, b = beer(id);
  el.disabled = true; el.textContent = 'Suche weltweit …';
  try { const r = await http('/api/lookup?q=' + encodeURIComponent(b.name)); enrichSheet(id, r.results, r.notes.concat(r.results.length ? [] : ['Online nichts gefunden. Angaben unter „Bearbeiten“ selbst eintragen.'])); }
  catch (e) { toast(e.server ? e.message : 'Keine Verbindung zum Server'); el.disabled = false; el.textContent = 'Weltweit suchen'; }
};
ACT.applyCand = async el => {
  const c = enrichState.cands[+el.dataset.i], b = beer(enrichState.id);
  const body = { id: b.id, ...candFields(c, b) };
  if ($('#en-name').checked && c.name) body.name = c.name;
  try { await send('beer', body); haptic(20); closeSheet(); toast('Ergänzt'); } catch (e) { toast(e.message); }
};
ACT.bulkEnrich = async () => {
  await catalog();
  const rows = D.beers.filter(missingInfo).map(b => ({ b, c: catBest(b.name) }));
  const hit = rows.filter(x => x.c && Object.keys(candFields(x.c, x.b, true)).length);
  enrichState = { bulk: hit };
  openSheet(head('Fehlende Infos') + `<p class="sheet-sub">Vorschläge aus dem Katalog. Nur leere Felder werden gefüllt, deine Namen bleiben.</p>
    ${hit.length ? `<div class="list">${hit.map((x, i) => `<label class="item" style="cursor:pointer"><input type="checkbox" class="bk" data-i="${i}" checked style="width:22px;height:22px;accent-color:var(--accent);flex:none"><div class="grow"><h3>${esc(x.b.name)}</h3><div class="sub">→ ${esc(x.c.name)} · ${candMeta(x.c)}</div></div></label>`).join('')}</div>
    <div class="savebar"><button class="btn primary block" data-act="bulkApply">${hit.length} ${hit.length === 1 ? 'Bier' : 'Biere'} ergänzen</button></div>` : '<div class="card soft small muted">Für diese Biere gibt es keinen eindeutigen Treffer im Katalog. Öffne ein Bier und nutze „Infos suchen“ für die weltweite Suche.</div>'}`);
};
ACT.bulkApply = async el => {
  const picks = $$('.bk').filter(x => x.checked).map(x => enrichState.bulk[+x.dataset.i]);
  el.disabled = true;
  let ok = 0;
  for (const x of picks) {
    el.textContent = `Ergänze ${ok + 1} von ${picks.length} …`;
    try { await http('/api/beer', { id: x.b.id, ...candFields(x.c, x.b, true) }); ok++; } catch (e) { toast(`${x.b.name}: ${e.message}`); }
  }
  await refresh(true); closeSheet(); toast(`${ok} ${ok === 1 ? 'Bier' : 'Biere'} ergänzt`);
};
const ratingCount = id => D.ratings.filter(r => r.beer === id).length;
async function doMerge(keep, drop) {
  const k = beer(keep), d = beer(drop);
  if (!(await ask({ title: 'Zusammenführen?', text: `„${d.name}“ geht in „${k.name}“ auf. Alle ${ratingCount(drop)} Bewertungen und Tastings werden übernommen. Rückgängig machen geht über den Papierkorb.`, ok: 'Zusammenführen' }))) return false;
  try { const r = await send('beer/merge', { keep, drop, user: me }); haptic(25); undoToast('Zusammengeführt', r.tid); return true; } catch (e) { toast(e.message); return false; }
}
ACT.dupes = () => {
  const list = findDuplicates();
  if (!list.length) { closeSheet(); return toast('Keine Doppelten gefunden'); }
  openSheet(head('Mögliche Doppelte') + `<p class="sheet-sub">Tippe auf das Bier, dessen Namen du behalten willst. Das andere geht darin auf.</p>`
    + list.slice(0, 30).map(x => { const [a, b] = ratingCount(x.a.id) >= ratingCount(x.b.id) ? [x.a, x.b] : [x.b, x.a]; return `<div class="list" style="margin-top:12px">
      ${[a, b].map((y, i) => `<button class="item" data-act="mergePair" data-keep="${y.id}" data-drop="${(i ? a : b).id}">${thumb(y)}<div class="grow"><h3>${esc(y.name)}</h3><div class="sub">${ratingCount(y.id)} Bewertungen${meta(y) ? ' · ' + meta(y) : ''}</div></div><span class="pill accent">behalten</span></button>`).join('')}
      <button class="item plain" data-act="notDupe" data-key="${x.key}" style="min-height:44px"><div class="grow small muted">Sind verschiedene Biere</div></button></div>`; }).join(''));
};
ACT.mergePair = async el => { if (await doMerge(el.dataset.keep, el.dataset.drop)) ACT.dupes(); };
ACT.notDupe = el => { LS.set('bs-not-dupes', [...LS.get('bs-not-dupes', []), el.dataset.key]); ACT.dupes(); };
ACT.mergeInto = el => {
  const keep = beer(el.dataset.id);
  const others = D.beers.filter(b => shown(b) && b.id !== keep.id).map(b => ({ b, s: sameBeer(keep, b) })).sort((a, b) => b.s - a.s || a.b.name.localeCompare(b.b.name, 'de'));
  openSheet(head('Zusammenführen') + `<p class="sheet-sub">Welches Bier ist dasselbe wie „${esc(keep.name)}“? Es geht darin auf, der Name „${esc(keep.name)}“ bleibt.</p>
    <div class="list">${others.slice(0, 40).map(x => `<button class="item" data-act="mergePick" data-keep="${keep.id}" data-drop="${x.b.id}">${thumb(x.b)}<div class="grow"><h3>${esc(x.b.name)}</h3><div class="sub">${ratingCount(x.b.id)} Bewertungen${meta(x.b) ? ' · ' + meta(x.b) : ''}</div></div>${x.s >= 0.72 ? '<span class="pill accent">ähnlich</span>' : ''}</button>`).join('')}</div>`);
};
ACT.mergePick = async el => { if (await doMerge(el.dataset.keep, el.dataset.drop)) closeSheet(); };

// ------------------------------------------------------------------ Profil & Einstellungen
function renderSettings() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const install = standalone ? '<p class="small muted" style="margin:0">✓ Läuft bereits als App.</p>'
    : deferredInstall ? '<button class="btn primary block" data-act="install">Als App installieren</button>'
      : ios ? '<p class="small" style="margin:0">In Safari auf <b>Teilen</b> tippen und <b>„Zum Home-Bildschirm“</b> wählen.</p>'
        : `<p class="small" style="margin:0">Im Browser-Menü <b>„App installieren“</b> wählen.</p>${isSecureContext ? '' : '<p class="tiny muted">Volle App-Installation und Offline-Modus brauchen HTTPS (z. B. Reverse Proxy oder Tailscale).</p>'}`;
  const mine = personBeers(me);
  const dup = findDuplicates().length;
  const item = (act, t, sub = '', extra = '') => `<button class="item plain" data-act="${act}" ${extra}><div class="grow"><h3>${t}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div><span class="chev">›</span></button>`;
  return {
    title: 'Profil', html: `
    <a class="page-head" href="${href('person', me)}" style="color:inherit">${avatar(me, 'lg')}<div class="grow"><h1 class="large-title">${esc(me)}</h1><div class="small muted">${mine.length} Biere bewertet · Profil ansehen ›</div></div></a>
    <div class="list">${item('renameMe', 'Namen ändern')}${item('switchUser', 'Person wechseln')}${item('invite', 'Leute einladen', 'QR-Code oder Link')}</div>
    <div class="section-title">Darstellung</div>
    <div class="seg">${[['', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, t]) => `<button class="${LS.get('bs-theme', '') === k ? 'on' : ''}" data-act="theme" data-v="${k}">${t}</button>`).join('')}</div>
    <div class="section-title">Als App</div><div class="card">${install}</div>
    <div class="section-title">Bierbuch pflegen</div>
    <div class="list">${item('dupes', 'Doppelte Biere zusammenführen', dup ? `${dup} mögliche Doppelte gefunden` : 'Keine gefunden')}${item('bulkEnrich', 'Fehlende Infos ergänzen', `${D.beers.filter(missingInfo).length} Biere ohne Brauerei, Stil oder Alkohol`)}</div>
    <div class="section-title">Brauerei-Logos</div>
    <div class="card">${D.logo_env ? '<p class="small" style="margin:0">✓ Logos sind über die Server-Einstellungen (LOGO_DEV_TOKEN) aktiv.</p>'
      : D.logos ? '<p class="small" style="margin:0">✓ Logos von Logo.dev sind aktiv.</p><button class="btn sm" style="margin-top:12px" data-act="logoToken" data-v="">Schlüssel entfernen</button>'
      : `<p class="small muted" style="margin:0">Mit einem kostenlosen Schlüssel von <a href="https://www.logo.dev" target="_blank" rel="noopener">Logo.dev</a> zeigen die Kacheln das Logo der Brauerei, einheitlich in Graustufen. Ohne Schlüssel bleiben die Farbkacheln.</p>
        <label class="lbl" for="logo-token">Publishable Key (beginnt mit pk_)</label><div class="row"><input class="field" id="logo-token" autocomplete="off" spellcheck="false" placeholder="pk_…"><button class="btn" data-act="logoToken">OK</button></div>`}
      ${D.logos ? `<button class="btn ghost sm" style="margin-top:6px;padding:0" data-act="logosRetry">Fehlende Logos erneut suchen</button>` : ''}</div>
    <div class="section-title">Online-Suche</div>
    <div class="card"><p class="small" style="margin:0">✓ Aktiv: ${(CAT || []).length || 'über 300'} Biere im eingebauten Katalog, dazu Wikidata, Open Food Facts und UPCitemdb (Barcode). Ergebnisse werden auf dem Server zwischengespeichert, damit die Suche auch bei Aussetzern der Dienste klappt.</p>
      ${D.off_contact ? '' : `<label class="lbl" for="off-mail">Kontakt-E-Mail (optional, von Open Food Facts erwünscht)</label><div class="row"><input class="field" id="off-mail" type="email" autocomplete="email" placeholder="du@example.de"><button class="btn" data-act="offContact">OK</button></div>`}</div>
    <div class="section-title">Papierkorb</div>
    <div class="list">${(D.trash || []).slice(0, 25).map(t => `<div class="item plain"><div class="grow"><h3>${esc(t.label)}</h3><div class="sub">${esc(t.by || 'Jemand')} · ${esc(ago(t.at))}${t.n ? ` · ${t.n} Noten` : ''}</div></div><button class="btn sm" data-act="restoreTrash" data-tid="${t.tid}">${t.kind === 'merge' ? 'Trennen' : 'Zurückholen'}</button></div>`).join('') || '<div class="item plain small muted">Leer. Gelöschtes liegt hier 30 Tage.</div>'}</div>
    <div class="section-title">Daten</div>
    <div class="list">${item('backups', 'Server-Sicherungen', 'Zu einem früheren Stand zurückspringen')}
      <a class="item plain" href="/api/backup" download><div class="grow"><h3>Backup herunterladen</h3><div class="sub">Alle Daten als JSON</div></div><span class="chev">↓</span></a>
      <a class="item plain" href="/api/csv?session=all&user=${encodeURIComponent(me)}" download><div class="grow"><h3>Alles als CSV</h3><div class="sub">Für Excel und Co.</div></div><span class="chev">↓</span></a>
      <label class="item plain" style="cursor:pointer"><div class="grow"><h3>Backup einspielen</h3><div class="sub">Ersetzt alle Daten, vorher wird gesichert</div></div><span class="chev">›</span><input type="file" accept=".json,application/json" data-change="restore" hidden></label></div>
    <p class="tiny faint" style="text-align:center;margin:28px 0 0">Bierstudio ${VERSION} · Daten: Wikidata (CC0), Open Food Facts (ODbL)${D.logos ? ' · <a href="https://logo.dev" target="_blank" rel="noopener">Logos provided by Logo.dev</a>' : ''}</p>`,
  };
}
ACT.logoToken = async el => {
  const v = el.dataset.v ?? $('#logo-token').value.trim();
  try { await send('settings', { logo_token: v }); LS.set('bs-logo-v', Date.now()); toast(v ? 'Logos sind aktiv' : 'Schlüssel entfernt'); } catch (e) { toast(e.message); }
};
ACT.logosRetry = async el => {
  el.disabled = true;
  try { await send('logos/retry', {}); LS.set('bs-logo-v', Date.now()); toast('Fehlende Logos werden neu gesucht'); render(); } catch (e) { toast(e.message); el.disabled = false; }
};
ACT.theme = el => { const v = el.dataset.v; LS.set('bs-theme', v); if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; render(); };
ACT.install = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; render(); };
ACT.offContact = async () => { try { await send('settings', { off_contact: $('#off-mail').value }); toast('Gespeichert'); } catch (e) { toast(e.message); } };
ACT.backups = async () => {
  try {
    const { backups } = await http('/api/backups');
    const t = iso => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    openSheet(head('Server-Sicherungen') + `<p class="sheet-sub">Zurückspringen ersetzt den Stand für alle. Der jetzige Stand wird vorher gesichert.</p>
      <div class="list">${backups.map(b => `<div class="item plain"><div class="grow"><h3>${t(b.at)}</h3><div class="sub">${Math.max(1, Math.round(b.size / 1024))} KB</div></div><button class="btn sm" data-act="backupRestore" data-name="${esc(b.name)}" data-at="${esc(t(b.at))}">Zurückspringen</button></div>`).join('') || '<div class="item plain muted">Noch keine Sicherungen.</div>'}</div>`);
  } catch (e) { toast(e.server ? e.message : 'Keine Verbindung zum Server'); }
};
ACT.backupRestore = async el => {
  if (!(await ask({ title: 'Stand wiederherstellen?', text: `Alle Daten springen auf den Stand von ${el.dataset.at} zurück, für alle Geräte. Der aktuelle Stand wird vorher gesichert.`, ok: 'Zurückspringen', danger: true }))) return;
  try { await send('backup/restore', { name: el.dataset.name }); Object.keys(drafts).forEach(k => delete drafts[k]); saveDrafts(); closeSheet(); toast('Stand wiederhergestellt'); } catch (e) { toast(e.message); }
};
CH.restore = async el => {
  const f = el.files[0];
  if (!f || !(await ask({ title: 'Backup einspielen?', text: 'Alle aktuellen Daten werden durch dieses Backup ersetzt. Vorher wird auf dem Server gesichert.', ok: 'Ersetzen', danger: true }))) { el.value = ''; return; }
  try { await send('restore', JSON.parse(await f.text())); Object.keys(drafts).forEach(k => delete drafts[k]); saveDrafts(); toast('Backup eingespielt'); }
  catch (e) { toast(e instanceof SyntaxError ? 'Keine gültige JSON-Datei' : e.message); }
  el.value = '';
};

// ------------------------------------------------------------------ Bottom-Sheet (zum Schließen nach unten ziehen)
const sheet = $('#sheet'), panel = $('#sheet-panel');
let closing = null, sheetBack = false;
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  if (closing) { clearTimeout(closing); closing = null; sheet.classList.add('in'); }
  if (!sheet.open) {
    sheet.showModal();
    history.pushState({ sheet: 1, inApp: true }, '');
    panel.style.setProperty('--dy', '0px');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('in')));
  }
  $('#sheet-body').scrollTop = 0;
}
function closeSheet(fromPop = false) {
  if (!sheet.open || closing) return;
  stopScan();
  sheet.classList.remove('in', 'dragging');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  closing = setTimeout(() => {
    closing = null; sheet.close(); panel.style.setProperty('--dy', '0px'); delete forms.s; addState = null;
    if (!fromPop && history.state?.sheet) { sheetBack = true; history.back(); } else afterSheet();
  }, reduce ? 200 : 340);
}
function afterSheet() {
  if (pendingNav) { const to = pendingNav; pendingNav = null; go(to); return; }
  if (pendingRender) { pendingRender = false; render(); } else render();
}
ACT.closeSheet = () => closeSheet();
addEventListener('popstate', () => { if (sheet.open && !closing) closeSheet(true); else if (sheetBack) { sheetBack = false; afterSheet(); } });
sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
const head = t => `<div class="sheet-head"><h2 id="sheet-title">${esc(t)}</h2><button class="icon-btn" data-act="closeSheet" aria-label="Schließen">${ICON.close}</button></div>`;
// Ziehen am Griff oder an der Kopfzeile: 1:1 mitgehen, beim Loslassen Schwung hochrechnen.
let drag = null;
const rubber = (x, d) => (x * d * 0.55) / (d + 0.55 * Math.abs(x));
panel.addEventListener('pointerdown', e => {
  if (!e.target.closest('.grab, .sheet-head') || e.target.closest('button, input, a')) return;
  drag = { y0: e.clientY, pts: [[e.timeStamp, e.clientY]], h: panel.offsetHeight, id: e.pointerId };
  panel.setPointerCapture(e.pointerId); sheet.classList.add('dragging');
});
panel.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y0;
  drag.pts.push([e.timeStamp, e.clientY]); if (drag.pts.length > 6) drag.pts.shift();
  panel.style.setProperty('--dy', (dy > 0 ? dy : rubber(dy, drag.h)) + 'px');
});
const endDrag = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y0, [t0, y0] = drag.pts[0], dt = Math.max(1, e.timeStamp - t0), v = (e.clientY - y0) / dt * 1000;
  const projected = dy + (v / 1000) * 0.99 / (1 - 0.99);
  sheet.classList.remove('dragging');
  if (projected > drag.h * 0.4 && dy > 10) closeSheet(); else panel.style.setProperty('--dy', '0px');
  drag = null;
};
panel.addEventListener('pointerup', endDrag);
panel.addEventListener('pointercancel', endDrag);

// ------------------------------------------------------------------ Events & Start
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const f = ACT[el.dataset.act];
  if (f) { if (el.tagName !== 'A') e.preventDefault(); f(el, e); }
});
// Links innerhalb eines Sheets: erst Sheet schließen, dann navigieren
sheet.addEventListener('click', e => { const a = e.target.closest('a[href^="#/"]'); if (a) { e.preventDefault(); go(a.getAttribute('href')); } });
document.addEventListener('input', e => { const el = e.target.closest('[data-on]'); if (el) ON[el.dataset.on]?.(el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) CH[el.dataset.change]?.(el, e); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.matches?.('[role="link"][data-act="go"]')) { go(e.target.dataset.to); return; }
  if (e.target.id === 'new-person') { e.preventDefault(); ACT.addUser(); }
  if (e.target.id === 's-newp') { e.preventDefault(); ACT.addPersonChip(); }
  if (e.target.id === 'f-q') { e.preventDefault(); const first = $('#a-res [data-act]'); if (first) first.click(); }
});
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (route().page === 'ich') render(); });
addEventListener('online', () => refresh(true));
addEventListener('offline', () => setOnline(false));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
addEventListener('pagehide', saveDrafts);
setInterval(() => { if (!document.hidden) refresh(); }, 4000);

// Alte Einladungslinks (?s=<id>) und Schnellaktion (?add=1)
const params = new URLSearchParams(location.search), joinId = params.get('s'), quickAdd = params.has('add');
if (joinId) history.replaceState(null, '', '/#/tasting/' + joinId);
else if (location.search) history.replaceState(null, '', '/' + location.hash);
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => { });
setOnline(online);
if (D) render();
refresh(true).then(() => { if (D && me && quickAdd) ACT.add(); });
