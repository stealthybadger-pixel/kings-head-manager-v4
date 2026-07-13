import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scripts/catt_categorized_final.json', 'utf8'));

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const cats = Object.keys(data);
const linked = cats.filter(c => !c.startsWith('[Not in your pantry]')).sort();
const unlinked = cats.filter(c => c.startsWith('[Not in your pantry]') && !c.includes('Other')).sort();
const other = cats.filter(c => c.includes('Other'));
const ordered = [...linked, ...unlinked, ...other];

let totalItems = 0;
const sectionsHtml = ordered.map(cat => {
  const items = data[cat];
  totalItems += items.length;
  const isLinked = !cat.startsWith('[Not in your pantry]');
  const rows = items.map(it => {
    const link = it.matchedIngredient ? '<span class="linked-tag">-> ' + esc(it.matchedIngredient) + '</span>' : '';
    return '<label class="row" data-id="' + it.id + '" data-name="' + esc(it.name.toLowerCase()) + '">' +
      '<input type="checkbox" class="keep-box" checked data-id="' + it.id + '" data-name="' + esc(it.name) + '" data-cat="' + esc(cat) + '">' +
      '<span class="item-name">' + esc(it.name) + '</span>' +
      link +
      '<span class="item-price">£' + it.packCost.toFixed(2) + ' <span class="item-pack">/ ' + it.packSize + it.packUnit + '</span></span>' +
      '</label>';
  }).join('\n');
  return '<section class="category" data-count="' + items.length + '">' +
    '<div class="cat-header">' +
    '<button class="cat-toggle" type="button">' +
    '<span class="chevron">&#9656;</span>' +
    '<span class="cat-title">' + esc(cat) + '</span>' +
    '<span class="cat-badge ' + (isLinked ? 'linked' : 'unlinked') + '">' + items.length + '</span>' +
    '</button>' +
    '<div class="cat-actions">' +
    '<button type="button" class="mini-btn keep-all">Keep all</button>' +
    '<button type="button" class="mini-btn remove-all">Remove all</button>' +
    '</div>' +
    '</div>' +
    '<div class="cat-body">' + rows + '</div>' +
    '</section>';
}).join('\n');

const css = [
  ':root { --bg:#F5F1E8; --surface:#FFFFFF; --surface-sunk:#ECE6D6; --text:#2B2620; --text-soft:#6B6252; --border:#DDD4BE; --brand:#3D5A3D; --brand-text:#F5F1E8; --accent:#A8622E; --keep:#3D7A4F; --keep-bg:#E4F0E6; --remove:#B5473A; --remove-bg:#F6E5E2; --font-display: Georgia, "Iowan Old Style", "Palatino Linotype", serif; --font-body: -apple-system, "Segoe UI", system-ui, sans-serif; --font-mono: "Cascadia Mono", "Consolas", ui-monospace, monospace; }',
  '@media (prefers-color-scheme: dark) { :root { --bg:#1B1812; --surface:#24211A; --surface-sunk:#171510; --text:#EDE7D8; --text-soft:#A69C87; --border:#3A3529; --brand:#5C8560; --brand-text:#F5F1E8; --accent:#D08B52; --keep:#6FBE84; --keep-bg:#1E2E20; --remove:#E08477; --remove-bg:#332019; } }',
  ':root[data-theme="dark"] { --bg:#1B1812; --surface:#24211A; --surface-sunk:#171510; --text:#EDE7D8; --text-soft:#A69C87; --border:#3A3529; --brand:#5C8560; --brand-text:#F5F1E8; --accent:#D08B52; --keep:#6FBE84; --keep-bg:#1E2E20; --remove:#E08477; --remove-bg:#332019; }',
  ':root[data-theme="light"] { --bg:#F5F1E8; --surface:#FFFFFF; --surface-sunk:#ECE6D6; --text:#2B2620; --text-soft:#6B6252; --border:#DDD4BE; --brand:#3D5A3D; --brand-text:#F5F1E8; --accent:#A8622E; --keep:#3D7A4F; --keep-bg:#E4F0E6; --remove:#B5473A; --remove-bg:#F6E5E2; }',
  '* { box-sizing: border-box; }',
  'body { margin:0; background:var(--bg); color:var(--text); font-family:var(--font-body); }',
  '.page { max-width: 900px; margin: 0 auto; padding-bottom: 4rem; }',
  '.masthead { background: var(--brand); color: var(--brand-text); padding: 1.75rem 1.5rem; position: sticky; top:0; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }',
  '.masthead h1 { font-family: var(--font-display); font-weight: 400; font-size: 1.5rem; margin: 0 0 0.4rem; }',
  '.masthead p { margin: 0; font-size: 0.85rem; opacity: 0.85; }',
  '.stat-bar { display:flex; gap:1.5rem; margin-top: 0.9rem; font-family: var(--font-mono); font-size: 0.8rem; flex-wrap: wrap; }',
  '.stat-bar b { font-size:1rem; }',
  '.controls { display:flex; gap:0.6rem; margin-top:1rem; flex-wrap: wrap; align-items:center; }',
  '.controls input[type=search] { flex:1; min-width:180px; padding:0.5rem 0.8rem; border-radius:6px; border:1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.12); color:var(--brand-text); font-size:0.85rem; }',
  '.controls input[type=search]::placeholder { color: rgba(245,241,232,0.6); }',
  '.controls button { padding:0.5rem 0.9rem; border-radius:6px; border:1px solid rgba(255,255,255,0.35); background:transparent; color:var(--brand-text); font-size:0.78rem; font-weight:600; cursor:pointer; }',
  '.controls button:hover { background: rgba(255,255,255,0.12); }',
  '.sheet { padding: 1.25rem 1.5rem; }',
  '.category { background:var(--surface); border:1px solid var(--border); border-radius:8px; margin-bottom:0.7rem; overflow:hidden; }',
  '.cat-header { display:flex; align-items:center; justify-content:space-between; padding:0.7rem 1rem; gap:0.5rem; }',
  '.cat-toggle { display:flex; align-items:center; gap:0.6rem; background:none; border:none; cursor:pointer; flex:1; text-align:left; padding:0; color: var(--text); }',
  '.chevron { transition: transform 0.15s; color: var(--text-soft); font-size:0.8rem; display:inline-block; }',
  '.category.open .chevron { transform: rotate(90deg); }',
  '.cat-title { font-weight:600; font-size:0.92rem; }',
  '.cat-badge { font-family:var(--font-mono); font-size:0.72rem; padding:0.1rem 0.5rem; border-radius:999px; }',
  '.cat-badge.linked { background: var(--keep-bg); color: var(--keep); }',
  '.cat-badge.unlinked { background: var(--surface-sunk); color: var(--text-soft); }',
  '.cat-actions { display:flex; gap:0.4rem; }',
  '.mini-btn { font-size:0.68rem; padding:0.25rem 0.55rem; border-radius:5px; border:1px solid var(--border); background:var(--surface-sunk); color:var(--text-soft); cursor:pointer; font-weight:600; }',
  '.mini-btn:hover { color:var(--text); }',
  '.cat-body { display:none; border-top:1px solid var(--border); }',
  '.category.open .cat-body { display:block; }',
  '.row { display:flex; align-items:center; gap:0.6rem; padding:0.45rem 1rem; border-bottom:1px solid var(--border); font-size:0.82rem; cursor:pointer; }',
  '.row:last-child { border-bottom:none; }',
  '.row:hover { background: var(--surface-sunk); }',
  '.row.hidden { display:none; }',
  '.keep-box { flex-shrink:0; width:15px; height:15px; accent-color: var(--keep); cursor:pointer; }',
  '.row.unchecked .item-name { text-decoration: line-through; color: var(--remove); opacity:0.7; }',
  '.item-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
  '.linked-tag { font-size:0.68rem; color: var(--keep); font-family: var(--font-mono); flex-shrink:0; }',
  '.item-price { font-family:var(--font-mono); font-variant-numeric: tabular-nums; flex-shrink:0; color:var(--text-soft); font-size:0.78rem; }',
  '.item-pack { text-transform:uppercase; }',
  '.footer-bar { position:sticky; bottom:0; background:var(--surface); border-top:1px solid var(--border); padding:1rem 1.5rem; display:flex; gap:1rem; align-items:center; justify-content:space-between; box-shadow: 0 -2px 8px rgba(0,0,0,0.08); flex-wrap:wrap; }',
  '.footer-stat { font-family:var(--font-mono); font-size:0.85rem; }',
  '.export-btn { background:var(--accent); color:white; border:none; padding:0.7rem 1.3rem; border-radius:6px; font-weight:700; font-size:0.82rem; cursor:pointer; }',
  '.export-btn:hover { opacity:0.9; }',
  '#exportBox { display:none; margin:1rem 1.5rem; }',
  '#exportBox textarea { width:100%; height:200px; font-family:var(--font-mono); font-size:0.72rem; padding:0.7rem; border-radius:6px; border:1px solid var(--border); background:var(--surface-sunk); color:var(--text); }',
  '#exportBox .copy-btn { margin-top:0.5rem; }'
].join('\n');

const script = [
  '(function() {',
  '  var catSections = document.querySelectorAll(".category");',
  '  catSections.forEach(function(sec) {',
  '    sec.querySelector(".cat-toggle").addEventListener("click", function() { sec.classList.toggle("open"); });',
  '    sec.querySelector(".keep-all").addEventListener("click", function(e) {',
  '      e.stopPropagation();',
  '      sec.querySelectorAll(".keep-box").forEach(function(cb) { cb.checked = true; cb.closest(".row").classList.remove("unchecked"); });',
  '      updateCounts();',
  '    });',
  '    sec.querySelector(".remove-all").addEventListener("click", function(e) {',
  '      e.stopPropagation();',
  '      sec.querySelectorAll(".keep-box").forEach(function(cb) { cb.checked = false; cb.closest(".row").classList.add("unchecked"); });',
  '      updateCounts();',
  '    });',
  '  });',
  '  if (catSections[0]) catSections[0].classList.add("open");',
  '  document.getElementById("expandAll").addEventListener("click", function() { catSections.forEach(function(s) { s.classList.add("open"); }); });',
  '  document.getElementById("collapseAll").addEventListener("click", function() { catSections.forEach(function(s) { s.classList.remove("open"); }); });',
  '  var allBoxes = Array.prototype.slice.call(document.querySelectorAll(".keep-box"));',
  '  allBoxes.forEach(function(cb) { cb.addEventListener("change", function() { cb.closest(".row").classList.toggle("unchecked", !cb.checked); updateCounts(); }); });',
  '  function updateCounts() {',
  '    var total = allBoxes.length;',
  '    var removed = allBoxes.filter(function(cb) { return !cb.checked; }).length;',
  '    document.getElementById("keepCount").textContent = total - removed;',
  '    document.getElementById("removeCount").textContent = removed;',
  '    document.getElementById("footerRemoveCount").textContent = removed;',
  '  }',
  '  var filterBox = document.getElementById("filterBox");',
  '  filterBox.addEventListener("input", function() {',
  '    var q = filterBox.value.trim().toLowerCase();',
  '    document.querySelectorAll(".row").forEach(function(row) {',
  '      var match = !q || row.dataset.name.indexOf(q) !== -1;',
  '      row.classList.toggle("hidden", !match);',
  '    });',
  '    catSections.forEach(function(sec) {',
  '      if (q) sec.classList.add("open");',
  '      var visibleCount = sec.querySelectorAll(".row:not(.hidden)").length;',
  '      sec.style.display = (q && visibleCount === 0) ? "none" : "";',
  '    });',
  '  });',
  '  document.getElementById("exportBtn").addEventListener("click", function() {',
  '    var removed = allBoxes.filter(function(cb) { return !cb.checked; }).map(function(cb) { return { id: cb.dataset.id, name: cb.dataset.name, category: cb.dataset.cat }; });',
  '    var text = JSON.stringify(removed, null, 2);',
  '    document.getElementById("exportText").value = text;',
  '    document.getElementById("exportBox").style.display = "block";',
  '    document.getElementById("exportBox").scrollIntoView({ behavior: "smooth" });',
  '  });',
  '  document.getElementById("copyBtn").addEventListener("click", function() {',
  '    var ta = document.getElementById("exportText");',
  '    ta.select();',
  '    document.execCommand("copy");',
  '    var btn = document.getElementById("copyBtn");',
  '    var orig = btn.textContent;',
  '    btn.textContent = "Copied!";',
  '    setTimeout(function() { btn.textContent = orig; }, 1200);',
  '  });',
  '})();'
].join('\n');

const html =
  '<style>' + css + '</style>\n' +
  '<div class="page">\n' +
  '  <header class="masthead">\n' +
  '    <h1>David Catt Catalogue Review</h1>\n' +
  '    <p>' + totalItems + ' products &middot; checked = keep, unchecked = remove. Pantry-linked categories are listed first.</p>\n' +
  '    <div class="stat-bar"><span>Keeping: <b id="keepCount">' + totalItems + '</b></span><span>Removing: <b id="removeCount" style="color:#ffd7cf">0</b></span></div>\n' +
  '    <div class="controls"><input type="search" id="filterBox" placeholder="Filter items by name..."><button id="expandAll">Expand all</button><button id="collapseAll">Collapse all</button></div>\n' +
  '  </header>\n' +
  '  <main class="sheet">\n' + sectionsHtml + '\n  </main>\n' +
  '  <div class="footer-bar"><span class="footer-stat">To remove: <b id="footerRemoveCount">0</b> items</span><button class="export-btn" id="exportBtn">Generate removal list</button></div>\n' +
  '  <div id="exportBox"><textarea id="exportText" readonly></textarea><button class="mini-btn copy-btn" id="copyBtn">Copy to clipboard</button></div>\n' +
  '</div>\n' +
  '<script>' + script + '</script>\n';

fs.writeFileSync('scripts/catt_review.html', html);
console.log('Wrote scripts/catt_review.html, ' + html.length + ' chars');
