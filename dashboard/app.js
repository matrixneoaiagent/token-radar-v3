(function () {
'use strict';
var D = window.RADAR;
var app = document.getElementById('app');
var dialog = document.getElementById('detail');
var meta = document.getElementById('meta');
if (!D || !app || !dialog || !meta) return;
var FAMILY_COLOR = {
defi: '#4e6b49',
chain: '#2f5f73',
infra: '#7a7466',
consumer: '#a9802a',
rwa: '#b4472a',
asset: '#8c8270',
unknown: '#938c7a'
};
var BOARD_SORTS = [
['implied', 'Implied value'],
['rank', 'Rank'],
['tvl', 'TVL'],
['growth', '7-day growth'],
['age', 'Age without a token'],
['farm', 'Farm propensity'],
['name', 'Name']
];
var LIVE_SORTS = [
['mcap', 'Market cap'],
['ratio', 'MCap / TVL'],
['tvl', 'TVL'],
['growth', '7-day growth'],
['name', 'Name']
];
var FAMILY_LABEL = {};
D.model.families.forEach(function (f) { FAMILY_LABEL[f.key] = f.label; });
var ROW_BY_SLUG = new Map(D.rows.map(function (r) { return [r.slug, r]; }));
var CHAINS = (function () {
var seen = new Set();
var out = [];
D.model.chains.forEach(function (c) { if (!seen.has(c.chain)) { seen.add(c.chain); out.push(c.chain); } });
D.rows.forEach(function (r) { r.chains.forEach(function (c) { if (!seen.has(c)) { seen.add(c); out.push(c); } }); });
D.live.forEach(function (r) { r.chains.forEach(function (c) { if (!seen.has(c)) { seen.add(c); out.push(c); } }); });
return out;
})();
var state = { tab: 'board', q: '', family: 'all', chain: 'all', watch: false, sort: 'implied', dir: -1, selected: null };
var refs = {};
var lastTab = null;
var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
var number = new Intl.NumberFormat('en-US');
function fmtUsd(n) {
if (n === null || n === undefined || !isFinite(n)) return '—';
var abs = Math.abs(n);
if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
return money.format(Math.round(n));
}
function fmtUsdFull(n) {
if (n === null || n === undefined || !isFinite(n)) return '—';
return money.format(Math.round(n));
}
function fmtPct(n) {
if (n === null || n === undefined || !isFinite(n)) return '—';
return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtPctShort(n) {
if (n === null || n === undefined || !isFinite(n)) return '—';
if (Math.abs(n) >= 1000) return (n > 0 ? '+' : '') + (n / 1000).toFixed(1) + 'k%';
return fmtPct(n);
}
function fmtAge(days) {
if (days === null || days === undefined) return '—';
if (days >= 730) return (days / 365).toFixed(1) + 'y';
return Math.max(0, Math.round(days)) + 'd';
}
function fmtMult(n) { return '×' + Number(n).toFixed(3); }
function fmtInt(n) { return number.format(Math.round(n)); }
function changeClass(n) { return n === null || n === undefined || n === 0 ? 'flat' : n > 0 ? 'pos' : 'neg'; }
function append(node, child) {
if (child === null || child === undefined || child === false) return;
if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
if (typeof child === 'string' || typeof child === 'number') { node.appendChild(document.createTextNode(String(child))); return; }
if (child instanceof Node) node.appendChild(child);
}
function el(tag, attrs) {
var node = document.createElement(tag);
if (attrs) {
Object.keys(attrs).forEach(function (k) {
var v = attrs[k];
if (v === null || v === undefined || v === false) return;
if (k === 'class') node.className = v;
else if (k === 'text') node.textContent = v;
else if (k === 'html') node.innerHTML = v;
else if (k === 'style') node.style.cssText = v;
else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'open') node[k] = Boolean(v);
else node.setAttribute(k, String(v));
});
}
for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function familyColor(key) { return FAMILY_COLOR[key] || FAMILY_COLOR.unknown; }
function familyLabel(key) { return FAMILY_LABEL[key] || 'Unclassified'; }
function familyTag(key) {
return el('span', { class: 'fam' }, el('i', { style: 'background:' + familyColor(key) }), familyLabel(key));
}
function chainsText(chains) {
if (!chains || chains.length === 0) return 'no chain recorded';
var head = chains.slice(0, 3).join(' · ');
return chains.length > 3 ? head + ' +' + (chains.length - 3) : head;
}
function ordinal(n) {
var m100 = n % 100;
if (m100 >= 11 && m100 <= 13) return n + 'th';
var m10 = n % 10;
return n + (m10 === 1 ? 'st' : m10 === 2 ? 'nd' : m10 === 3 ? 'rd' : 'th');
}
function readHash() {
var raw = window.location.hash.replace(/^#/, '');
if (!raw) return;
var p = new URLSearchParams(raw);
if (p.get('tab') === 'live') state.tab = 'live';
if (p.get('q')) state.q = p.get('q');
if (p.get('family')) state.family = p.get('family');
if (p.get('chain')) state.chain = p.get('chain');
if (p.get('watch') === '1') state.watch = true;
if (p.get('sort')) state.sort = p.get('sort');
if (p.get('dir') === '1') state.dir = 1;
if (p.get('dir') === '-1') state.dir = -1;
if (p.get('p')) state.selected = p.get('p');
if (state.tab === 'live' && !LIVE_SORTS.some(function (s) { return s[0] === state.sort; })) {
state.sort = 'mcap'; state.dir = -1;
}
if (state.tab === 'board' && !BOARD_SORTS.some(function (s) { return s[0] === state.sort; })) {
state.sort = 'implied'; state.dir = -1;
}
}
function writeHash() {
var p = new URLSearchParams();
if (state.tab !== 'board') p.set('tab', state.tab);
if (state.q) p.set('q', state.q);
if (state.family !== 'all') p.set('family', state.family);
if (state.chain !== 'all') p.set('chain', state.chain);
if (state.watch) p.set('watch', '1');
if (state.sort !== (state.tab === 'board' ? 'implied' : 'mcap')) p.set('sort', state.sort);
if (state.dir !== -1) p.set('dir', String(state.dir));
if (state.selected) p.set('p', state.selected);
var hash = p.toString();
try {
history.replaceState(null, '', hash ? '#' + hash : window.location.pathname + window.location.search);
} catch (e) {
window.location.hash = hash;
}
}
function filteredBoardRows() {
var q = state.q.trim().toLowerCase();
var rows = D.rows.filter(function (r) {
if (state.family !== 'all' && r.family !== state.family) return false;
if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
if (state.watch && !r.watchlist) return false;
if (q) {
var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.family_label + ' ' + r.chains.join(' ')).toLowerCase();
if (hay.indexOf(q) === -1) return false;
}
return true;
});
return rows.sort(compareRows);
}
function filteredLiveRows() {
var q = state.q.trim().toLowerCase();
var rows = D.live.filter(function (r) {
if (state.family !== 'all' && r.family !== state.family) return false;
if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
if (q) {
var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + familyLabel(r.family) + ' ' + r.chains.join(' ')).toLowerCase();
if (hay.indexOf(q) === -1) return false;
}
return true;
});
return rows.sort(compareLiveRows);
}
function valueFor(row, key) {
if (key === 'rank') return row.rank;
if (key === 'tvl') return row.tvl_usd;
if (key === 'growth') return row.change_7d;
if (key === 'age') return row.age_days;
if (key === 'farm') return row.model.propensity;
if (key === 'implied') return row.implied_value_usd;
return null;
}
function compareRows(a, b) {
if (state.sort === 'name') return a.name.localeCompare(b.name) * state.dir || a.rank - b.rank;
var av = valueFor(a, state.sort);
var bv = valueFor(b, state.sort);
if (av === null && bv === null) return a.rank - b.rank;
if (av === null) return 1;
if (bv === null) return -1;
return (av - bv) * state.dir || a.rank - b.rank;
}
function liveValue(row, key) {
if (key === 'mcap') return row.mcap_usd;
if (key === 'ratio') return row.ratio;
if (key === 'tvl') return row.tvl_usd;
if (key === 'growth') return row.change_7d;
return null;
}
function compareLiveRows(a, b) {
if (state.sort === 'name') return a.name.localeCompare(b.name) * state.dir || a.slug.localeCompare(b.slug);
var av = liveValue(a, state.sort);
var bv = liveValue(b, state.sort);
if (av === null && bv === null) return a.slug.localeCompare(b.slug);
if (av === null) return 1;
if (bv === null) return -1;
return (av - bv) * state.dir || a.slug.localeCompare(b.slug);
}
function setSort(key, live) {
if (state.sort === key) state.dir = -state.dir;
else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
renderActive();
writeHash();
}
function metaItems() {
var top = D.rows[0];
return [
['Snapshot', D.as_of],
['Protocols read', fmtInt(D.protocol_count)],
['Watchlist', D.watchlist_size + ' / ' + D.watchlist_size],
['Board rows', fmtInt(D.board_size)],
['Live comparables', fmtInt(D.model.global_sample)],
['Top claim', fmtUsd(top ? top.implied_value_usd : 0)]
];
}
function renderMeta() {
clear(meta);
metaItems().forEach(function (pair) {
meta.appendChild(el('div', { class: 'meta-item' }, el('span', { text: pair[0] }), el('b', { text: pair[1] })));
});
}
function stat(label, value, note, accent) {
return el('div', { class: 'stat' + (accent ? ' accent' : '') },
el('span', { text: label }),
el('b', { text: value }),
el('i', { text: note })
);
}
function renderHero() {
var top = D.rows[0];
var farmFirst = D.rows.filter(function (r) { return r.family !== 'asset' && r.family !== 'rwa'; }).length;
var highestTvl = D.rows.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; })[0];
var lead = top;
return el('section', { class: 'hero' },
el('div', { class: 'hero-copy' },
el('p', { class: 'hero-lede' },
'This guide asks two questions of every protocol that records no token: what would a token claim be worth if its record stayed as it is, and what would it cost you to farm it? The board is sorted by the first answer; the second is on every row. ',
el('b', { text: 'Risk curators, capital allocators and RWA wrappers are covered, but their TVL is client money: the model caps them at 0.02×–0.06×.' })
),
el('div', { class: 'stats' },
stat('Top implied value', fmtUsd(top.implied_value_usd), top.name + ' · rank 1', true),
stat('Watchlist covered', D.watchlist_size + ' / ' + D.watchlist_size, 'every slug named'),
stat('Farm-first rows', farmFirst + ' / ' + D.board_size, 'DeFi · chain · infra · consumer'),
stat('Largest TVL', fmtUsd(highestTvl.tvl_usd), highestTvl.name + ' · ' + ordinal(highestTvl.rank))
)
),
el('div', { class: 'map-card' },
el('div', { class: 'map-top' }, el('h2', { text: 'The field map' }), el('span', { text: 'log TVL × log implied' })),
mapPlot(lead),
el('div', { class: 'map-legend' },
D.model.families.map(function (f) {
return el('span', { class: 'legend-item' }, el('i', { class: 'legend-swatch', style: 'background:' + familyColor(f.key) }), f.label);
})
),
el('p', { class: 'map-note', text: 'Each dot is a board row: up is more implied value, right is more TVL. Asset-management AUM sits low on the right by design.' })
)
);
}
function mapPlot(lead) {
var plot = el('div', { class: 'map-plot' });
var xs = D.rows.map(function (r) { return Math.log10(Math.max(1, r.tvl_usd)); });
var ys = D.rows.map(function (r) { return Math.log10(Math.max(1, r.implied_value_usd)); });
var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
var spanX = maxX - minX || 1, spanY = maxY - minY || 1;
D.rows.forEach(function (r) {
var x = ((Math.log10(Math.max(1, r.tvl_usd)) - minX) / spanX) * 100;
var y = ((Math.log10(Math.max(1, r.implied_value_usd)) - minY) / spanY) * 100;
var dot = el('span', {
class: 'map-dot',
style: 'left:' + x.toFixed(2) + '%;bottom:' + y.toFixed(2) + '%;background:' + familyColor(r.family),
title: r.name + ' · ' + fmtUsd(r.implied_value_usd) + ' implied · ' + fmtUsd(r.tvl_usd) + ' TVL'
});
plot.appendChild(dot);
if (lead && r.slug === lead.slug) {
plot.appendChild(el('span', { class: 'map-dot lead', style: 'left:' + x.toFixed(2) + '%;bottom:' + y.toFixed(2) + '%' }));
plot.appendChild(el('span', { class: 'map-label', style: 'left:' + x.toFixed(2) + '%;bottom:' + y.toFixed(2) + '%', text: '#1 ' + r.name }));
}
});
plot.appendChild(el('span', { class: 'map-axis-y' }, el('span', { text: 'implied value →' })));
plot.appendChild(el('span', { class: 'map-axis-x', text: 'tvl →' }));
return plot;
}
function formulaBand() {
return el('div', { class: 'formula-band' },
el('span', { class: 'formula' }, 'implied = ', el('b', { text: 'TVL' }), ' × ', el('b', { text: 'multiple' }), ' × ', el('b', { text: 'propensity' }), ' × 0.50 × growth × tenure × chain'),
el('span', { class: 'formula-note', text: 'multiple = min(category median mcap/TVL, family cap)' }),
el('span', { class: 'formula-chip', text: D.model.version + ' · ' + D.model.global_sample + ' comparables' })
);
}
function tabButton(tab, text, count) {
return el('button', { class: 'tab' + (state.tab === tab ? ' active' : ''), dataset: { tab: tab }, role: 'tab', 'aria-selected': state.tab === tab ? 'true' : 'false' },
el('span', { text: text }), ' ', el('b', { text: String(count) })
);
}
function renderPanel() {
var panel = el('section', { class: 'panel', id: 'board' });
var head = el('div', { class: 'panel-head' },
el('div', {},
el('p', { class: 'eyebrow', id: 'panel-eyebrow', text: 'the board' }),
el('h2', { id: 'panel-title' }),
el('p', { class: 'panel-sub', id: 'panel-sub' })
),
el('div', { class: 'panel-count' }, el('b', { id: 'panel-count' }), el('span', { id: 'panel-count-label' }))
);
panel.appendChild(head);
var tabs = el('div', { class: 'tabs', role: 'tablist' },
tabButton('board', 'Pre-token board', D.board_size),
tabButton('live', 'Token comparables', D.live.length)
);
tabs.addEventListener('click', function (e) {
var b = e.target.closest ? e.target.closest('.tab') : null;
if (!b) return;
state.tab = b.dataset.tab;
state.selected = null;
if (state.tab === 'live' && !LIVE_SORTS.some(function (s) { return s[0] === state.sort; })) { state.sort = 'mcap'; state.dir = -1; }
if (state.tab === 'board' && !BOARD_SORTS.some(function (s) { return s[0] === state.sort; })) { state.sort = 'implied'; state.dir = -1; }
renderActive();
writeHash();
});
panel.appendChild(tabs);
var q = el('input', { class: 'input', id: 'q', type: 'search', placeholder: 'name, slug, category, chain', 'aria-label': 'Search the board' });
var family = el('select', { class: 'select', id: 'family', 'aria-label': 'Filter by family' },
el('option', { value: 'all', text: 'All families' }),
D.model.families.map(function (f) { return el('option', { value: f.key, text: f.label }); })
);
var chain = el('select', { class: 'select', id: 'chain', 'aria-label': 'Filter by chain' },
el('option', { value: 'all', text: 'All chains' }),
CHAINS.map(function (c) { return el('option', { value: c, text: c }); })
);
var sort = el('select', { class: 'select', id: 'sort', 'aria-label': 'Sort by' });
var dir = el('button', { class: 'btn ghost', id: 'dir', type: 'button', 'aria-label': 'Toggle sort direction' });
var watchInput = el('input', { type: 'checkbox', id: 'watch' });
var watch = el('label', { class: 'check', id: 'watch-wrap' }, watchInput, 'Watchlist only');
var reset = el('button', { class: 'btn ghost', id: 'reset', type: 'button', text: 'Reset' });
var toolbar = el('div', { class: 'toolbar', id: 'toolbar' },
el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), q),
el('div', { class: 'field' }, el('label', { for: 'family', text: 'Family' }), family),
el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort' }), sort),
dir,
watch,
reset
);
panel.appendChild(toolbar);
panel.appendChild(el('div', { class: 'filter-line', id: 'filter-line' }));
panel.appendChild(el('div', { id: 'table-host' }));
q.addEventListener('input', function () { state.q = q.value; renderActive(); writeHash(); });
family.addEventListener('change', function () { state.family = family.value; renderActive(); writeHash(); });
chain.addEventListener('change', function () { state.chain = chain.value; renderActive(); writeHash(); });
sort.addEventListener('change', function () {
state.sort = sort.value;
state.dir = state.sort === 'name' ? 1 : -1;
renderActive();
writeHash();
});
dir.addEventListener('click', function () { state.dir = -state.dir; renderActive(); writeHash(); });
watchInput.addEventListener('change', function () { state.watch = watchInput.checked; renderActive(); writeHash(); });
reset.addEventListener('click', function () {
state.q = ''; state.family = 'all'; state.chain = 'all'; state.watch = false; state.sort = state.tab === 'board' ? 'implied' : 'mcap'; state.dir = -1;
renderActive();
writeHash();
});
refs.q = q; refs.family = family; refs.chain = chain; refs.sort = sort; refs.dir = dir; refs.watch = watchInput; refs.watchWrap = watch;
refs.panelEyebrow = head.querySelector('#panel-eyebrow');
refs.panelTitle = head.querySelector('#panel-title');
refs.panelSub = head.querySelector('#panel-sub');
refs.panelCount = head.querySelector('#panel-count');
refs.panelCountLabel = head.querySelector('#panel-count-label');
refs.tabs = tabs;
refs.filterLine = panel.querySelector('#filter-line');
refs.tableHost = panel.querySelector('#table-host');
return panel;
}
function syncControls() {
var isBoard = state.tab === 'board';
refs.q.value = state.q;
refs.family.value = state.family;
refs.chain.value = state.chain;
refs.watch.checked = state.watch;
refs.watchWrap.hidden = !isBoard;
var defs = isBoard ? BOARD_SORTS : LIVE_SORTS;
if (lastTab !== state.tab) {
clear(refs.sort);
defs.forEach(function (s) { refs.sort.appendChild(el('option', { value: s[0], text: s[1] })); });
lastTab = state.tab;
}
if (!defs.some(function (s) { return s[0] === state.sort; })) {
state.sort = defs[0][0];
state.dir = -1;
}
refs.sort.value = state.sort;
refs.dir.textContent = state.dir === -1 ? '↓ Desc' : '↑ Asc';
refs.dir.setAttribute('aria-label', state.dir === -1 ? 'Sorted descending; switch to ascending' : 'Sorted ascending; switch to descending');
refs.tabs.querySelectorAll('.tab').forEach(function (t) {
var active = t.dataset.tab === state.tab;
t.classList.toggle('active', active);
t.setAttribute('aria-selected', active ? 'true' : 'false');
});
}
function renderActive() {
syncControls();
var isBoard = state.tab === 'board';
if (isBoard) {
refs.panelEyebrow.textContent = 'the board';
refs.panelTitle.innerHTML = 'Pre-token <em>farm board</em>';
refs.panelSub.textContent = 'Every row records no token. Ranked by implied value; click a row for its factor breakdown and farm plan.';
refs.panelCount.textContent = String(D.board_size);
refs.panelCountLabel.textContent = 'rows ranked';
refs.filterLine.textContent = '';
var rows = filteredBoardRows();
refs.filterLine.appendChild(document.createTextNode('Showing '));
refs.filterLine.appendChild(el('b', { text: String(rows.length) }));
refs.filterLine.appendChild(document.createTextNode(' of '));
refs.filterLine.appendChild(el('b', { text: String(D.board_size) }));
refs.filterLine.appendChild(document.createTextNode(' rows'));
filterChips(refs.filterLine, isBoard);
clear(refs.tableHost);
refs.tableHost.appendChild(el('div', { class: 'table-wrap' }, boardTable(rows)));
} else {
refs.panelEyebrow.textContent = 'the comparables';
refs.panelTitle.innerHTML = 'Token <em>comparables</em>';
refs.panelSub.textContent = 'These protocols record a token. They set the category multiples; they are not farm targets.';
refs.panelCount.textContent = String(D.live.length);
refs.panelCountLabel.textContent = 'live comparables';
refs.filterLine.textContent = '';
var live = filteredLiveRows();
refs.filterLine.appendChild(document.createTextNode('Showing '));
refs.filterLine.appendChild(el('b', { text: String(live.length) }));
refs.filterLine.appendChild(document.createTextNode(' of '));
refs.filterLine.appendChild(el('b', { text: String(D.live.length) }));
refs.filterLine.appendChild(document.createTextNode(' comparables'));
filterChips(refs.filterLine, isBoard);
clear(refs.tableHost);
refs.tableHost.appendChild(el('div', { class: 'table-wrap' }, liveTable(live)));
}
}
function filterChips(host, isBoard) {
if (state.q) host.appendChild(el('span', { class: 'filter-chip', text: 'search: ' + state.q }));
if (state.family !== 'all') host.appendChild(el('span', { class: 'filter-chip', text: 'family: ' + familyLabel(state.family) }));
if (state.chain !== 'all') host.appendChild(el('span', { class: 'filter-chip', text: 'chain: ' + state.chain }));
if (isBoard && state.watch) host.appendChild(el('span', { class: 'filter-chip', text: 'watchlist only' }));
if (state.sort !== (isBoard ? 'implied' : 'mcap') || state.dir !== -1) {
var name = (isBoard ? BOARD_SORTS : LIVE_SORTS).filter(function (s) { return s[0] === state.sort; })[0];
host.appendChild(el('span', { class: 'filter-chip', text: 'sort: ' + (name ? name[1] : state.sort) + (state.dir === 1 ? ' ↑' : ' ↓') }));
}
}
function sortHeader(label, key, cls, live) {
var th = el('th', { class: cls + (state.sort === key ? ' sorted' : ''), scope: 'col', 'aria-sort': state.sort === key ? (state.dir === 1 ? 'ascending' : 'descending') : 'none' },
label, el('span', { class: 'arrow', text: state.sort === key ? (state.dir === 1 ? ' ↑' : ' ↓') : '' })
);
th.addEventListener('click', function () { setSort(key, live); });
return th;
}
function boardTable(rows) {
var maxImplied = D.rows[0] ? D.rows[0].implied_value_usd : 1;
var table = el('table', { class: 'board' });
var thead = el('thead', {}, el('tr', {},
sortHeader('#', 'rank', 'c-rank'),
sortHeader('Protocol', 'name', 'c-name'),
sortHeader('TVL', 'tvl', 'c-tvl'),
sortHeader('7D', 'growth', 'c-grow'),
sortHeader('Age', 'age', 'c-age'),
sortHeader('Farm', 'farm', 'c-farm'),
sortHeader('Implied value', 'implied', 'c-value'),
el('th', { class: 'c-plan', scope: 'col', text: 'Plan' })
));
table.appendChild(thead);
var tbody = el('tbody');
if (rows.length === 0) {
tbody.appendChild(el('tr', {}, el('td', { colspan: 8, class: 'empty', text: 'No protocol matches these filters. Clear the search or reset the family and chain.' })));
}
rows.forEach(function (r) {
var pips = el('span', { class: 'pips' });
var filled = Math.round(r.model.propensity * 5);
for (var i = 0; i < 5; i++) pips.appendChild(el('span', { class: 'pip' + (i < filled ? ' on' : '') + (r.family === 'asset' ? ' low' : '') }));
var tr = el('tr', { class: r.rank === 1 ? 'lead' : '', tabindex: '0', role: 'button', 'aria-label': 'Rank ' + r.rank + ', ' + r.name + ', ' + fmtUsdFull(r.implied_value_usd) + ' implied value' },
el('td', { class: 'c-rank' }, el('span', { class: 'rank-badge', text: String(r.rank) })),
el('td', { class: 'c-name' },
el('span', { class: 'p-name', text: r.name }),
el('span', { class: 'p-sub' },
familyTag(r.family),
el('span', { class: 'sep', text: '/' }),
el('span', { text: r.category || 'no category' }),
el('span', { class: 'sep', text: '/' }),
el('span', { text: chainsText(r.chains) }),
r.watchlist ? el('span', { class: 'badge watch', text: 'watchlist' }) : el('span', { class: 'badge early', text: 'early' })
)
),
el('td', { class: 'c-tvl num', text: fmtUsd(r.tvl_usd) }),
el('td', { class: 'c-grow num ' + changeClass(r.change_7d), text: fmtPctShort(r.change_7d), title: r.change_7d === null ? 'no seven-day change reported' : fmtPct(r.change_7d) }),
el('td', { class: 'c-age num', text: fmtAge(r.age_days) }),
el('td', { class: 'c-farm' }, el('span', { class: 'farm-cell' }, pips, el('span', { class: 'farm-num', text: '×' + r.model.propensity.toFixed(2) }))),
el('td', { class: 'c-value' }, el('span', { class: 'value-cell' },
el('span', { class: 'num big', text: fmtUsd(r.implied_value_usd) }),
el('span', { class: 'value-bar' }, el('span', { style: 'width:' + Math.max(4, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' }))
)),
el('td', { class: 'c-plan' }, el('button', { class: 'plan-btn', type: 'button', text: r.farm_steps.length + ' steps' }))
);
tr.addEventListener('click', function () { openDetail(r.slug); });
tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } });
var plan = tr.querySelector('.plan-btn');
if (plan) plan.addEventListener('click', function (e) { e.stopPropagation(); openDetail(r.slug); });
tbody.appendChild(tr);
});
table.appendChild(tbody);
return table;
}
function liveTable(rows) {
var table = el('table', { class: 'board live' });
var thead = el('thead', {}, el('tr', {},
el('th', { class: 'c-rank', scope: 'col', text: '#' }),
sortHeader('Protocol', 'name', 'c-name', true),
sortHeader('TVL', 'tvl', 'c-tvl', true),
sortHeader('Market cap', 'mcap', 'c-mcap', true),
sortHeader('MCap / TVL', 'ratio', 'c-ratio', true),
sortHeader('7D', 'growth', 'c-grow', true)
));
table.appendChild(thead);
var tbody = el('tbody');
rows.forEach(function (r, i) {
tbody.appendChild(el('tr', {},
el('td', { class: 'c-rank num', text: String(i + 1) }),
el('td', { class: 'c-name' },
el('span', { class: 'p-name', text: r.name }),
el('span', { class: 'p-sub' },
familyTag(r.family), el('span', { class: 'sep', text: '/' }),
el('span', { text: r.category || 'no category' }), el('span', { class: 'sep', text: '/' }),
el('span', { text: chainsText(r.chains) }),
el('span', { class: 'badge early', text: 'token trades' })
)
),
el('td', { class: 'c-tvl num', text: fmtUsd(r.tvl_usd) }),
el('td', { class: 'c-mcap num', text: fmtUsd(r.mcap_usd) }),
el('td', { class: 'c-ratio num', text: r.ratio.toFixed(2) + '×' }),
el('td', { class: 'c-grow num ' + changeClass(r.change_7d), text: fmtPctShort(r.change_7d) })
));
});
table.appendChild(tbody);
var banner = el('div', { class: 'live-banner' },
el('b', { text: 'comparables only' }),
'These protocols record a token. Their market caps set the category multiples; they are not farm targets and they are not on the board.'
);
var wrap = el('div', {}, banner, table);
return wrap;
}
function methodSection() {
var left = el('div', { class: 'method-card' },
el('h3', { text: 'The model, on one page' }),
el('div', { class: 'formula-block' },
el('div', {}, el('b', { text: 'implied' }), ' = round( ', el('b', { text: 'tvl_usd' })),
el('div', { text: '  × effective_multiple   // min(category median mcap/TVL, family cap)' }),
el('div', { text: '  × airdrop_propensity   // family prior, 0.15 .. 1.05' }),
el('div', { text: '  × 0.50                 // launch, liquidity and execution risk' }),
el('div', { text: '  × growth_multiplier    // 7d change clamped −60%..+120%, 35% pass-through' }),
el('div', { text: '  × tenure_multiplier    // days without a token, peak at 540 days' }),
el('div', { text: '  × chain_multiplier     // depth 0.95..1.12, plus a small breadth bonus' }),
el('div', { text: ')' })
),
el('p', { text: 'TVL is the base. The category median is learned from token-bearing comparables and capped by family; the airdrop propensity is the family prior. Growth is clamped to −60%..+120% and passed at 35%, tenure peaks at 540 days without a token, and chain depth is log-scaled to 0.95..1.12. The detail view shows every factor and recomputes the row.' })
);
var policyRows = D.model.families.map(function (f) {
return el('tr', {},
el('td', {}, el('span', { class: 'fam' }, el('i', { style: 'background:' + familyColor(f.key) }), f.label)),
el('td', { class: 'n cap', text: f.value_cap.toFixed(2) + '×' }),
el('td', { class: 'n prop', text: f.propensity.toFixed(2) + '×' }),
el('td', { text: f.note })
);
});
var policy = el('table', { class: 'policy-table' },
el('thead', {}, el('tr', {}, el('th', { text: 'Family' }), el('th', { class: 'n', text: 'value cap' }), el('th', { class: 'n', text: 'propensity' }), el('th', { text: 'why' }))),
el('tbody', {}, policyRows)
);
var categoryRows = D.model.categories.slice(0, 30).map(function (c) {
return el('tr', {},
el('td', {}, el('span', { class: 'fam' }, el('i', { style: 'background:' + familyColor(c.family) }), c.key)),
el('td', { class: 'n', text: String(c.n) }),
el('td', { class: 'n', text: c.source === 'category' && c.median !== null ? c.median.toFixed(3) + '×' : 'global' }),
el('td', { class: 'n', text: c.effective.toFixed(3) + '×' })
);
});
var categoryTable = el('table', { class: 'category-table' },
el('thead', {}, el('tr', {}, el('th', { text: 'Category' }), el('th', { class: 'n', text: 'n' }), el('th', { class: 'n', text: 'median' }), el('th', { class: 'n', text: 'effective' }))),
el('tbody', {}, categoryRows)
);
var right = el('div', { class: 'method-card' },
el('h3', { text: 'Who gets capped, and why' }),
el('p', { text: 'The family table is the answer to the brief\'s warning. Raw TVL or an uncapped mcap/TVL median puts risk curators and capital allocators at the top, because their AUM is large and their comps are rich. That is a fund ranking, not a farm ranking. The cap is a policy prior applied by category word, never by protocol name.' }),
policy,
el('p', { class: 'policy-note', text: 'Airdrop propensity is the family\'s prior, not a probability. The value cap bounds what a token can capture; the propensity then discounts the chance that a farming token exists at all.' }),
el('h3', { style: 'margin-top:12px', text: 'The learned category table' }),
el('p', { text: 'Categories with at least three live comparables use their own median mcap/TVL. Thinner categories inherit the global median of ' + D.model.global_multiple.toFixed(3) + '× from ' + D.model.global_sample + ' comparables. The family cap applies after either.' }),
el('div', { class: 'category-scroll' }, categoryTable),
el('p', { class: 'policy-note', text: 'Sorted with board categories first, then by sample size. A category with n below 3 is shown with its inherited multiple, not its own.' })
);
return el('section', { class: 'method' }, left, right);
}
function renderShell() {
renderMeta();
app.appendChild(renderHero());
app.appendChild(formulaBand());
app.appendChild(renderPanel());
app.appendChild(methodSection());
renderActive();
if (state.selected) {
var r = ROW_BY_SLUG.get(state.selected);
if (r) openDetail(state.selected);
}
}
function parseStep(s) {
var costAt = s.lastIndexOf(' Cost: ');
var timeAt = s.lastIndexOf(' Time: ');
if (costAt < 0 || timeAt < costAt) return { text: s, cost: '', time: '' };
var text = s.slice(0, costAt).trim();
var cost = s.slice(costAt + 7, timeAt).trim().replace(/\.$/, '');
var time = s.slice(timeAt + 7).trim().replace(/\.$/, '');
return { text: text, cost: cost, time: time };
}
function factorRow(label, value, note) {
return el('tr', {}, el('td', { class: 'lab', text: label }), el('td', { class: 'val', text: value }), el('td', { class: 'note', text: note }));
}
function openDetail(slug) {
var r = ROW_BY_SLUG.get(slug);
if (!r) return;
state.selected = slug;
var m = r.model;
var recomputed = Math.max(1, Math.round(r.tvl_usd * m.effective_multiple * m.propensity * m.launch_discount * m.growth_multiplier * m.tenure_multiplier * m.chain_multiplier));
var matches = recomputed === r.implied_value_usd;
var steps = r.farm_steps.map(function (s, i) {
var p = parseStep(s);
return el('li', { class: 'step' },
el('span', { class: 'step-num', text: String(i + 1).padStart(2, '0') }),
el('span', {},
el('span', { class: 'step-text', text: p.text }),
el('span', { class: 'step-meta' },
el('span', { class: 'chip cost', text: 'cost: ' + p.cost }),
el('span', { class: 'chip', text: 'time: ' + p.time })
)
)
);
});
var factorTable = el('table', { class: 'factor-table' },
el('tbody', {},
factorRow('TVL', fmtUsdFull(r.tvl_usd), ordinal(m.tvl_rank) + ' largest on board'),
factorRow('Category median', m.category_source === 'category' ? (m.category_median === null ? '—' : m.category_median.toFixed(3) + '×') : D.model.global_multiple.toFixed(3) + '×', (m.category_key || 'no category') + ' · n=' + m.category_sample + ' · ' + (m.category_source === 'category' ? 'own median' : 'thin sample, global')),
factorRow('Family cap', m.family_cap.toFixed(2) + '×', m.family_label),
factorRow('Effective multiple', m.effective_multiple.toFixed(3) + '×', 'min(' + m.category_raw.toFixed(3) + '×, cap)'),
factorRow('Airdrop propensity', m.propensity.toFixed(2) + '×', m.family_label + ' prior'),
factorRow('Launch discount', m.launch_discount.toFixed(2) + '×', 'launch, liquidity and execution risk'),
factorRow('Seven-day growth', r.change_7d === null ? 'neutral' : fmtPct(r.change_7d), r.change_7d === null ? 'no change reported' : 'clamped ' + fmtPct(m.growth_pct) + ' → ' + fmtMult(m.growth_multiplier)),
factorRow('Tenure without a token', fmtMult(m.tenure_multiplier), r.age_days === null ? 'listing date not recorded' : r.age_days + ' days on record'),
factorRow('Chain depth', fmtMult(m.chain_multiplier), (m.chain_best || 'no chain') + ' · ' + m.chain_extra + ' extra deep'),
el('tr', { class: 'total' }, el('td', { class: 'lab', text: 'Implied value' }), el('td', { class: 'val', text: fmtUsdFull(r.implied_value_usd) }), el('td', { class: 'note', text: matches ? 'page recompute matches' : 'recompute differs' }))
)
);
var prev = r.rank > 1 ? D.rows[r.rank - 2] : null;
var next = r.rank < D.rows.length ? D.rows[r.rank] : null;
var inner = el('div', { class: 'sheet-inner' },
el('div', { class: 'sheet-head' },
el('div', {},
el('p', { class: 'kicker', text: 'Rank ' + r.rank + ' of ' + D.board_size + ' · ' + (r.watchlist ? 'watchlist' : 'early, below the floor') + ' · records no token' }),
el('h2', { id: 'detail-title', text: r.name }),
el('p', { class: 'sheet-sub' },
familyLabel(r.family), el('span', { class: 'sep', text: ' / ' }),
r.category || 'no category', el('span', { class: 'sep', text: ' / ' }),
chainsText(r.chains), el('span', { class: 'sep', text: ' / ' }),
'snapshot ' + D.as_of
)
),
el('button', { class: 'close-btn', type: 'button', text: 'Close ✕' })
),
el('div', { class: 'sheet-grid' },
el('div', {},
el('div', { class: 'implied-big', text: fmtUsdFull(r.implied_value_usd) }),
el('p', { class: 'implied-label', text: 'implied value · a model claim, not a price or a promise' }),
factorTable,
el('div', { class: 'why' }, el('b', { text: 'Why this rank. ' }), r.why)
),
el('div', {},
el('h3', { text: 'How to farm it' }),
el('p', { class: 'panel-sub', style: 'margin:0 0 7px', text: 'Nine steps. Each says what it costs and how long it takes.' }),
el('div', { class: 'farm-kit' },
el('div', { class: 'kit' }, el('span', { text: 'capital' }), el('b', { text: '$' + r.farm_kit.capital_usd })),
el('div', { class: 'kit' }, el('span', { text: 'gas band' }), el('b', { text: r.farm_kit.gas_band })),
el('div', { class: 'kit' }, el('span', { text: 'hold' }), el('b', { text: r.farm_kit.hold_days + ' days' })),
el('div', { class: 'kit' }, el('span', { text: 'cadence' }), el('b', { text: r.farm_kit.cadence_weeks + ' weeks' }))
),
el('ol', { class: 'steps' }, steps),
el('p', { class: 'sheet-foot', text: 'Costs are estimates in USD at the snapshot date; they are not guarantees. The plan is an operational sketch, not financial advice. Never pay to claim and never share a seed phrase.' }),
el('div', { class: 'pager' },
el('button', { class: 'btn ghost', type: 'button', text: prev ? '← Rank ' + prev.rank + ' · ' + prev.name : '← First row', disabled: !prev, onclick: function () { if (prev) { openDetail(prev.slug); writeHash(); } } }),
el('button', { class: 'btn ghost', type: 'button', text: next ? 'Rank ' + next.rank + ' · ' + next.name + ' →' : 'Last row →', disabled: !next, onclick: function () { if (next) { openDetail(next.slug); writeHash(); } } })
)
)
)
);
clear(dialog);
dialog.appendChild(inner);
var close = inner.querySelector('.close-btn');
if (close) close.addEventListener('click', function () { dialog.close(); });
if (!dialog.open) dialog.showModal();
var scroller = dialog.querySelector('.sheet-inner');
if (scroller) scroller.scrollTop = 0;
writeHash();
}
dialog.addEventListener('close', function () {
state.selected = null;
writeHash();
});
dialog.addEventListener('click', function (e) {
if (e.target === dialog) dialog.close();
});
readHash();
renderShell();
})();
