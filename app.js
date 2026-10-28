'use strict';
// ブローチ研究：自分だけの調査アーカイブ（iPhoneの中に保存し、iCloud Driveへはボタンで保存）
const VERSION = '1.1.0';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nowISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 19); };
const today = () => nowISO().slice(0, 10);
const fmtDate = s => s ? s.slice(0, 10).replace(/-/g, '/') : '';
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const CERT = { fixed: '確定', doc: '資料に記載', seller: '出品者の主張', guess: '自分の推測', ai: 'AIの提案', unk: '未確認' };
const certTag = c => c ? `<span class="tag t-${c}">${CERT[c]}</span>` : '';
const KIND = { own: '所有品', seen: '見かけた品', ref: '参考品' };
const PARTS = ['表', '裏', '刻印', '留め具', 'ヒンジ', '横', '斜め', 'その他'];
const FIELDS = [
  ['mark', '刻印'], ['serial', '製造番号'], ['brand', 'ブランド・メーカーの候補'], ['era', '年代'],
  ['countryShown', '国（表示）'], ['countryGuess', '国（推定）'], ['stones', '石'], ['metal', '金属と仕上げ'],
  ['findings', '金具（ピン・留め具）'], ['form', '形の種類'], ['back', '裏面の特徴'], ['size', '大きさ'], ['weight', '重さ'],
  ['condition', '状態・修理・入れ替えの疑い'], ['extras', '付属品（タグ・箱など）'],
  ['buyDate', '購入日'], ['shop', '購入先・見かけた場所'], ['price', '表示価格'], ['paid', '実際に払った額'], ['how', '入手の経緯'], ['bundle', 'まとめ買い'],
  ['set', 'セット（デミパリュール）'], ['twin', '同じ型・色違い'], ['search', '英語の検索語（Gem用）'], ['memo', 'メモ']
];
const LONG = new Set(['stones', 'metal', 'findings', 'back', 'condition', 'how', 'memo', 'set', 'twin', 'bundle']);

// ---------- 状態 ----------
const S = { items: [], photos: [], sources: [], brands: [], materials: [], unconfirmed: [], kv: {}, ideas: [], srcNames: {} };
const urlCache = new Map();
async function loadAll() {
  const names = ['items', 'photos', 'sources', 'brands', 'materials', 'unconfirmed', ...MORE_STORES];
  const vals = await Promise.all(names.map(s => DB.all(s)));
  names.forEach((n, i) => S[n] = vals[i]);
  for (const k of ['lastBackup', 'lastFullBackup', 'changes', 'ideas', 'srcNames', 'initialParts']) S.kv[k] = await DB.get('kv', k);
  S.ideas = S.kv.ideas || []; S.srcNames = S.kv.srcNames || {};
  S.sources.sort((a, b) => a.key.localeCompare(b.key));
}
async function setKV(k, v) { S.kv[k] = v; await DB.put('kv', v, k); }
async function changed(n = 1) { await setKV('changes', (S.kv.changes || 0) + n); updateSaveChip(); }
const itemById = id => S.items.find(i => i.id === id);
const photoById = id => S.photos.find(p => p.id === id);

async function thumbURL(pid) {
  const k = 't' + pid; if (urlCache.has(k)) return urlCache.get(k);
  const b = await DB.get('blobs', pid); const blob = b && (b.thumb || b.orig);
  const u = blob ? URL.createObjectURL(blob) : ''; urlCache.set(k, u); return u;
}
async function origURL(pid) {
  const k = 'o' + pid; if (urlCache.has(k)) return urlCache.get(k);
  const b = await DB.get('blobs', pid); if (!b || !b.orig) return '';
  const u = URL.createObjectURL(b.orig); urlCache.set(k, u); return u;
}
// 描画後に data-thumb を持つ img に写真を入れる
async function fillThumbs(root = document) {
  for (const img of root.querySelectorAll('img[data-thumb]')) {
    const pid = img.dataset.thumb; img.removeAttribute('data-thumb'); if (!pid) continue;
    const u = await thumbURL(pid); if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'noimg', textContent: '写真はまだ読み込まれていません' }));
    img.removeAttribute('data-thumb');
  }
}

// ---------- 表示の部品 ----------
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
function setTitle(t, back) { $('#title').textContent = t; $('#back').hidden = !back; $('#back').onclick = () => back === true ? history.back() : (location.hash = back); }
function sheet(html, onMount) {
  $('#sheetin').innerHTML = html; $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
  $('#sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };
  onMount && onMount($('#sheetin'));
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetin').innerHTML = ''; document.body.style.overflow = ''; }
function confirmSheet(msg, okLabel, onOK, danger) {
  sheet(`<h2>${esc(msg)}</h2><div class="row"><button class="btn ${danger ? 'danger' : 'primary'} grow" id="cok">${esc(okLabel)}</button><button class="btn grow" id="cno">やめる</button></div>`, el => {
    el.querySelector('#cno').onclick = closeSheet; el.querySelector('#cok').onclick = async () => { closeSheet(); await onOK(); };
  });
}
function updateSaveChip() {
  const c = S.kv.changes || 0, last = S.kv.lastBackup; const chip = $('#savechip');
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
  const need = S.items.length && (c >= 10 || (last ? days >= 7 && c > 0 : c >= 5));
  chip.hidden = !S.items.length;
  chip.textContent = c ? `未保存の変更 ${c}` : '保存済み';
  chip.classList.toggle('warn', !!need);
  chip.onclick = () => location.hash = 'save';
  const b = $('#banner');
  if (need && !sessionStorage.getItem('hideBanner')) {
    b.hidden = false;
    b.innerHTML = `<p>${last ? `前回のiCloudへの保存から${days}日たちました。` : 'まだiCloudに保存していません。'}変更が${c}件あります。</p><a class="btn sm primary" href="#save">保存する</a><button class="btn sm" id="bhide">あとで</button>`;
    b.querySelector('#bhide').onclick = () => { try { sessionStorage.setItem('hideBanner', 1); } catch (e) { } b.hidden = true; };
  } else b.hidden = true;
  const pend = S.items.filter(i => i.confirm === 'pending').length;
  $('#checkbadge').hidden = !pend; $('#checkbadge').textContent = pend;
}
const fieldVal = (it, k) => it.fields?.[k]?.v || '';
const mainPhoto = it => it.photoIds.find(id => photoById(id)?.part === '表') || it.photoIds[0];

// ---------- 画面：はじめて ----------
function viewWelcome() {
  setTitle('ブローチ研究');
  return `<div class="card"><h2>はじめに、データを読み込みます</h2>
  <p class="lead">このアプリのデータは、このiPhoneの中だけに保存されます。最初に、お渡しした「初期データ」のファイルを読み込んでください。</p>
  <ol class="steps"><li>「ファイルを選んで読み込む」を押します。</li><li>「ブローチ研究_初期データ_1_文章と小さい写真」を選びます（ほかの番号も一緒に選んで構いません）。</li><li>元の写真（2〜6）は、あとから少しずつ読み込んでも大丈夫です。</li></ol>
  <button class="btn primary full" id="wimport">ファイルを選んで読み込む</button>
  <button class="btn full" id="wempty">データなしで始める</button></div>`;
}

// ---------- 画面：作品一覧 ----------
let itemFilter = 'all', itemQ = '';
function viewItems() {
  setTitle('作品');
  const unsorted = S.photos.filter(p => !p.itemId && !p.sourceKey).length;
  return `<div class="row"><button class="btn primary grow" id="newitem">＋ 作品を登録</button><a class="btn grow" href="#unsorted">未整理の写真 ${unsorted}</a></div>
  <input class="search" id="iq" type="search" placeholder="名前・刻印・メモで探す" value="${esc(itemQ)}" aria-label="作品を検索">
  <div id="res">${itemsRes()}</div>`;
}
function itemsRes() {
  const q = itemQ.trim().toLowerCase();
  const list = S.items.filter(i =>
    (itemFilter === 'all' || i.kind === itemFilter || (itemFilter === 'pending' && i.confirm === 'pending')) &&
    (!q || [i.name, ...Object.values(i.fields || {}).map(f => f.v)].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const f = [['all', 'すべて'], ['own', '所有品'], ['seen', '見かけた品'], ['ref', '参考品'], ['pending', '確認待ち']];
  return `<div class="chips" role="group" aria-label="絞り込み">${f.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${itemFilter === k}">${l}</button>`).join('')}</div>
  <p class="small">${list.length}件</p>
  ${list.length ? `<div class="grid">${list.map(tile).join('')}</div>` : `<p class="empty">まだ作品がありません。「作品を登録」か、「未整理の写真」から作れます。</p>`}`;
}
function tile(i) {
  const p = mainPhoto(i), mark = fieldVal(i, 'mark'), mc = i.fields?.mark?.c;
  return `<a class="tile" href="#item/${i.id}"><div class="ph">${p ? `<img data-thumb="${p}" alt="">` : `<div class="noimg">写真なし</div>`}
   ${i.confirm === 'pending' ? '<span class="flag pend">確認待ち</span>' : `<span class="flag">${KIND[i.kind] || ''}</span>`}</div>
   <div class="nm">${esc(i.name || '名前なし')}</div><div class="mk">${mark ? '刻印：' + esc(mark) : '刻印：未記入'} ${mc ? certTag(mc) : ''}</div></a>`;
}

// ---------- 画面：作品カルテ ----------
function viewItem(id) {
  const it = itemById(id); if (!it) return '<p class="empty">この作品は見つかりません。</p>';
  setTitle(it.name || '作品', 'items');
  const ph = it.photoIds.map(pid => { const p = photoById(pid); return p ? `<button class="ph" type="button" data-view="${pid}" data-item="${it.id}"><img data-thumb="${pid}" alt="${esc(p.part || '写真')}"><span>${esc(p.part || '部位なし')}</span></button>` : ''; }).join('');
  const filled = FIELDS.filter(([k]) => it.fields?.[k]?.v);
  const empty = FIELDS.filter(([k]) => !it.fields?.[k]?.v).map(([, l]) => l);
  const mark = fieldVal(it, 'mark');
  return `${it.confirm === 'pending' ? `<div class="card" style="border-color:var(--c-seller)"><b>確認待ち</b><p class="lead">${esc(it.confirmNote || '')}</p><a class="btn sm" href="#check">確認の画面へ</a></div>` : ''}
  <div class="card"><div class="row"><span class="tag t-unk">${KIND[it.kind] || ''}</span><span class="small">登録 ${fmtDate(it.created)}・更新 ${fmtDate(it.updated)}</span></div>
   <div class="photos">${ph}<button class="addph" type="button" id="addph">＋写真を<br>足す</button><button class="addph" type="button" id="fromun">未整理から<br>選ぶ</button></div></div>
  <div class="card"><div class="row"><h3 class="grow">記録</h3><a class="btn sm" href="#item/${it.id}/edit">編集</a></div>
   ${filled.length ? `<dl class="fields">${filled.map(([k, l]) => `<div class="f"><dt>${l}</dt><dd>${esc(it.fields[k].v)} ${certTag(it.fields[k].c)}</dd></div>`).join('')}</dl>` : '<p class="empty">まだ何も書いていません。「編集」から書き足せます。</p>'}
   ${empty.length ? `<p class="small">空いている欄：${empty.join('、')}</p>` : ''}</div>
  <div class="card"><h3>調べる</h3>
   <a class="btn full" href="${rcjURL(mark)}" target="_blank" rel="noopener">刻印辞典で確認${mark && /[A-Za-z]/.test(mark) ? `（${mark.replace(/[^A-Za-z]/g, '')[0].toUpperCase()}のページ）` : ''}</a>
   <a class="btn full" id="gem" href="https://gem.app/" target="_blank" rel="noopener">Gemで似たデザインを探す</a>
   <p class="small">Gemを押すと、検索語「${esc(fieldVal(it, 'search') || defaultQuery(it))}」をコピーしてから Gem を開きます。Gem の検索欄に貼り付けてください。</p></div>
  <div class="card"><h3>履歴</h3><ul class="hist">${[...it.history].reverse().map(h => `<li><time>${fmtDate(h.at)} ${h.at.slice(11, 16)}</time>${esc(h.text)}</li>`).join('')}</ul></div>
  ${itemLinks(it)}
  <button class="btn danger" id="delitem">この作品を削除</button>`;
}
function defaultQuery(it) {
  const m = fieldVal(it, 'mark'); const base = m && !/なし|見つかって|番号のみ/.test(m) ? `"${m.replace(/[©®]/g, '')}" ` : 'vintage ';
  return base + 'brooch';
}
const RCJ = 'https://www.costumejewelrycollectors.com/vintage-costume-jewelry-research/costume-jewelry-marks/';
const RCJ_PAGE = { A: 'researching-costume-jewelry-history-jewelry-marks-a/', B: 'researching-costume-jewelry-history-jewelry-signatures-b/', C: 'researching-costume-jewelry-signatures-c/', D: 'researching-costume-jewelry-signatures-jewelry-history-d/', E: 'costume-jewelry-history-jewelry-signatures-e/', F: 'costume-jewelry-marks-jewelry-history-f/', G: 'researching-jewelry-history-jewelry-signatures-g/', H: 'costume-jewelry-history-jewelry-marks-h/', I: 'costume-jewelry-research-jewelry-signatures/', J: 'costume-jewelry-history-and-jewelry-signatures-j/', K: 'costume-jewelry-research-jewelry-history-jewelry-signatures-jewelry-marks-k/', W: 'researching-costume-jewelry-history-w/', X: 'researching-costume-jewelry-history-x-y-z/', Y: 'researching-costume-jewelry-history-x-y-z/', Z: 'researching-costume-jewelry-history-x-y-z/' };
'LMNOPQRSTUV'.split('').forEach((l, n) => RCJ_PAGE[l] = 'researching-costume-jewelry-history-companies-and-signatures-' + (n + 3) + '/');
function rcjURL(mark) {
  const w = String(mark || '').replace(/[©®\s'’"]/g, '').toUpperCase();
  if (w.startsWith('CORO')) return 'https://www.costumejewelrycollectors.com/vintage-costume-jewelry-research/the-history-and-marks-of-coro-jewelry/';
  const l = w.match(/[A-Z]/); return l && RCJ_PAGE[l[0]] ? RCJ + RCJ_PAGE[l[0]] : RCJ + 'researching-costume-jewelry-history-companies-and-signatures/';
}

// ---------- 画面：作品の編集 ----------
function viewEdit(id) {
  const isNew = id === 'new'; const it = isNew ? { name: '', kind: 'own', fields: {} } : itemById(id);
  if (!it) return '<p class="empty">この作品は見つかりません。</p>';
  setTitle(isNew ? '作品を登録' : '編集', isNew ? 'items' : 'item/' + id);
  const certBtns = (k, c) => `<div class="cert" role="group" aria-label="確かさ">${Object.entries(CERT).map(([ck, cl]) => `<button type="button" class="t-${ck}" data-cert="${k}" data-c="${ck}" aria-pressed="${(c || 'unk') === ck}">${cl}</button>`).join('')}</div>`;
  return `<form class="edit" id="editform">
   <div class="fld"><label for="f-name">名前</label><input id="f-name" name="name" value="${esc(it.name)}" placeholder="例：青い石の楕円ブローチ"></div>
   <div class="fld"><label for="f-kind">種類</label><select id="f-kind" name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
   ${FIELDS.map(([k, l]) => { const f = it.fields?.[k] || {}; return `<div class="fld"><label for="f-${k}">${l}</label>
     ${LONG.has(k) ? `<textarea id="f-${k}" name="${k}">${esc(f.v)}</textarea>` : `<input id="f-${k}" name="${k}" value="${esc(f.v)}" ${k === 'buyDate' ? 'placeholder="例：2021-05-20"' : ''}>`}
     ${certBtns(k, f.c)}<input type="hidden" name="c-${k}" value="${f.c || 'unk'}"></div>`; }).join('')}
   <p class="small">空いている欄はそのままで保存できます。あとからいつでも書き足せます。書き直した内容は「履歴」に残ります。</p>
   <div class="row"><button class="btn primary grow" type="submit">保存</button><a class="btn grow" href="${isNew ? '#items' : '#item/' + id}">やめる</a></div></form>`;
}
async function saveEdit(id, form) {
  const fd = new FormData(form); const isNew = id === 'new'; const t = nowISO();
  const it = isNew ? { id: uid('i-'), created: t, photoIds: [], history: [{ at: t, text: '登録' }], confirm: null, fields: {} } : structuredClone(itemById(id));
  const changes = [];
  const name = fd.get('name').trim(), kind = fd.get('kind');
  if (!isNew && name !== it.name) changes.push(`名前：「${it.name}」→「${name}」`);
  if (!isNew && kind !== it.kind) changes.push(`種類：${KIND[it.kind]}→${KIND[kind]}`);
  it.name = name; it.kind = kind; it.fields = it.fields || {};
  for (const [k, l] of FIELDS) {
    const v = (fd.get(k) || '').trim(), c = v ? fd.get('c-' + k) : '';
    const old = it.fields[k] || {};
    if ((old.v || '') !== v || (v && (old.c || 'unk') !== c)) {
      if (!isNew) changes.push(old.v ? (v ? `${l}：「${old.v}」${old.c ? `（${CERT[old.c]}）` : ''}→「${v}」（${CERT[c]}）` : `${l}：「${old.v}」を消した`) : `${l}：「${v}」（${CERT[c]}）を書き足した`);
      if (v) it.fields[k] = { v, c }; else delete it.fields[k];
    }
  }
  if (!isNew && !changes.length) { location.hash = 'item/' + id; return; }
  it.updated = t; if (!isNew) it.history.push({ at: t, text: changes.join('\n') });
  await DB.put('items', it);
  const i = S.items.findIndex(x => x.id === it.id); if (i >= 0) S.items[i] = it; else S.items.push(it);
  await changed(); toast('保存しました'); location.hash = 'item/' + it.id;
}

// ---------- 写真 ----------
async function makeThumb(file) {
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, 520 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .8));
    return { blob, w: bmp.width, h: bmp.height };
  } catch (e) { return { blob: null, w: 0, h: 0 }; }
}
async function addPhotos(files, itemId) {
  const ids = [];
  for (const f of files) {
    const id = uid('p'); const th = await makeThumb(f);
    const meta = { id, name: f.name, ext: (f.name.split('.').pop() || 'jpg').toLowerCase(), w: th.w, h: th.h, size: f.size, part: '', itemId: itemId || null, sourceKey: null, folders: [], added: today() };
    await DB.put('blobs', { id, orig: f, thumb: th.blob }); await DB.put('photos', meta); S.photos.push(meta); ids.push(id);
  }
  if (itemId) {
    const it = itemById(itemId); it.photoIds.push(...ids); it.updated = nowISO();
    it.history.push({ at: it.updated, text: `写真を${ids.length}枚足した` }); await DB.put('items', it);
  }
  await changed(ids.length); return ids;
}
async function linkPhoto(pid, itemId, part) {
  const p = photoById(pid); const it = itemById(itemId); if (!p || !it) return;
  if (p.itemId && p.itemId !== itemId) await unlinkPhoto(pid, true);
  p.itemId = itemId; if (part !== undefined) p.part = part; p.updated = nowISO(); await DB.put('photos', p);
  if (!it.photoIds.includes(pid)) { it.photoIds.push(pid); it.updated = nowISO(); it.history.push({ at: it.updated, text: `写真を入れた（${p.name}）` }); await DB.put('items', it); }
  await changed();
}
async function unlinkPhoto(pid, silent) {
  const p = photoById(pid); if (!p || !p.itemId) return; const it = itemById(p.itemId);
  if (it) { it.photoIds = it.photoIds.filter(x => x !== pid); it.updated = nowISO(); it.history.push({ at: it.updated, text: `写真を外した（${p.name}）` }); await DB.put('items', it); }
  p.itemId = null; p.updated = nowISO(); await DB.put('photos', p); if (!silent) await changed();
}
async function openViewer(pid, ctxItem) {
  const p = photoById(pid); if (!p) return;
  const o = await origURL(pid), t = await thumbURL(pid);
  const v = document.createElement('div'); v.className = 'viewer';
  v.innerHTML = `<div class="vt"><b>${esc(p.part ? p.part + '・' : '')}${esc(p.name)}</b><button class="btn sm" id="vclose">閉じる</button></div>
   <div class="vb" id="vb"><img src="${o || t}" alt=""></div>
   <div class="vf">${o ? '' : '<span class="small" style="color:#ccc;width:100%">元の写真はまだ読み込まれていません（小さい写真を表示中）。</span>'}
    ${ctxItem ? `<button class="btn sm" id="vpart">部位：${esc(p.part || '未設定')}</button><button class="btn sm" id="vunlink">作品から外す</button>` : `<button class="btn sm" id="vnew">この写真から作品を作る</button><button class="btn sm" id="vlink">作品に入れる</button>`}
    <button class="btn sm" id="vzoom">拡大</button></div>`;
  document.body.appendChild(v); document.body.style.overflow = 'hidden';
  const close = () => { v.remove(); document.body.style.overflow = ''; };
  v.querySelector('#vclose').onclick = close;
  v.querySelector('#vzoom').onclick = () => v.querySelector('#vb').classList.toggle('zoom');
  if (ctxItem) {
    v.querySelector('#vpart').onclick = () => { close(); pickPart(pid, ctxItem); };
    v.querySelector('#vunlink').onclick = async () => { close(); await unlinkPhoto(pid); toast('作品から外して「未整理の写真」に戻しました'); route(); };
  } else {
    v.querySelector('#vnew').onclick = async () => { close(); await newItemFromPhoto(pid); };
    v.querySelector('#vlink').onclick = () => { close(); pickItemFor(pid); };
  }
}
function pickPart(pid, itemId) {
  const p = photoById(pid);
  sheet(`<h2>写真の部位</h2><div class="chips" style="flex-wrap:wrap">${PARTS.map(x => `<button class="chip" data-part="${x}" aria-pressed="${p.part === x}">${x}</button>`).join('')}</div>`, el => {
    el.querySelectorAll('[data-part]').forEach(b => b.onclick = async () => { p.part = b.dataset.part; p.updated = nowISO(); await DB.put('photos', p); await changed(); closeSheet(); route(); });
  });
}
async function newItemFromPhoto(pid) {
  const t = nowISO(); const it = { id: uid('i-'), name: '', kind: 'own', fields: {}, photoIds: [], confirm: null, created: t, updated: t, history: [{ at: t, text: '写真から登録' }] };
  await DB.put('items', it); S.items.push(it); await linkPhoto(pid, it.id, '表'); location.hash = 'item/' + it.id + '/edit';
}
function pickItemFor(pid) {
  const list = [...S.items].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  sheet(`<h2>どの作品に入れますか</h2><input class="search" id="pq" type="search" placeholder="作品の名前で探す"><ul class="list" id="pl"></ul>`, el => {
    const draw = () => { const q = el.querySelector('#pq').value.toLowerCase(); el.querySelector('#pl').innerHTML = list.filter(i => !q || (i.name || '').toLowerCase().includes(q)).slice(0, 60).map(i => `<li><button class="li" style="width:100%" data-pi="${i.id}"><div class="tx"><b>${esc(i.name || '名前なし')}</b><span>${KIND[i.kind]}・${esc(fieldVal(i, 'mark'))}</span></div></button></li>`).join(''); };
    draw(); el.querySelector('#pq').oninput = draw;
    el.querySelector('#pl').onclick = async e => { const b = e.target.closest('[data-pi]'); if (!b) return; closeSheet(); await linkPhoto(pid, b.dataset.pi); toast('作品に入れました'); location.hash = 'item/' + b.dataset.pi; };
  });
}
function viewUnsorted() {
  setTitle('未整理の写真', 'items');
  const list = S.photos.filter(p => !p.itemId && !p.sourceKey);
  return `<p class="lead">どの作品のものか、まだ決まっていない写真です。押すと、作品を作るか、作品に入れるかを選べます。</p>
  <button class="btn primary" id="addun">＋ 写真を足す</button>
  ${list.length ? `<div class="grid">${list.map(p => `<button class="tile" type="button" data-view="${p.id}"><div class="ph"><img data-thumb="${p.id}" alt=""></div><div class="mk">${esc(p.name)}</div></button>`).join('')}</div>` : '<p class="empty">未整理の写真はありません。</p>'}`;
}

// ---------- 画面：辞典 ----------
let dictTab = 'brand', dictQ = '';
const GOJ = [['ア', 'アイウエオヴァィゥェォ'], ['カ', 'カキクケコガギグゲゴ'], ['サ', 'サシスセソザジズゼゾ'], ['タ', 'タチツテトダヂヅデドッ'], ['ナ', 'ナニヌネノ'], ['ハ', 'ハヒフヘホバビブベボパピプペポ'], ['マ', 'マミムメモ'], ['ヤ', 'ヤユヨャュョ'], ['ラ', 'ラリルレロ'], ['ワ', 'ワヲン']];
const toKata = s => String(s || '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const gyou = k => { const c = toKata(k)[0]; const g = GOJ.find(g => g[1].includes(c)); return g ? g[0] : '他'; };
function viewDict() {
  setTitle('辞典');
  const q = dictQ.trim().toLowerCase();
  const tabs = `<div class="chips" role="group" aria-label="辞典の種類">${[['brand', 'ブランド'], ['mat', '素材・用語'], ['idea', 'アイデア']].map(([k, l]) => `<button class="chip" data-dt="${k}" aria-pressed="${dictTab === k}">${l}</button>`).join('')}</div>`;
  if (dictTab === 'idea') return tabs + `<ul class="list">${S.ideas.map(([t, d]) => `<li class="li"><div class="tx"><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`).join('')}</ul>`;
  const search = `<input class="search" id="dq" type="search" placeholder="${dictTab === 'brand' ? '名前・読み・刻印・ノートの原文で探す' : '素材・用語を探す'}" value="${esc(dictQ)}" aria-label="辞典を検索">`;
  return tabs + search + `<div id="res">${dictRes()}</div>`;
}
function dictRes() {
  const q = dictQ.trim().toLowerCase();
  if (dictTab === 'mat') {
    const list = S.materials.filter(m => !q || [m.n, m.e, m.f, m.b, m.id, m.x].join(' ').toLowerCase().includes(q));
    return `<p class="small">${list.length}件</p><ul class="list">${list.map(m => `<li><a class="li" href="#mat/${encodeURIComponent(m.n)}"><div class="tx"><b>${esc(m.n)}${m.x ? '<span class="x">食い違い</span>' : ''}${m.todo ? '<span class="e">情報待ち</span>' : ''}</b><span>${esc(m.e || '')}${m.y ? '・' + esc(m.y) : ''}</span></div><span class="arrow">›</span></a></li>`).join('')}</ul>`;
  }
  const list = S.brands.filter(b => !q || [b.n, b.k, b.m, b.r, b.f, b.x, (b.nb || []).map(s => s.h + ' ' + s.t).join(' ')].join(' ').toLowerCase().includes(q))
    .sort((a, b) => toKata(a.k).localeCompare(toKata(b.k), 'ja'));
  const groups = {}; list.forEach(b => (groups[gyou(b.k)] = groups[gyou(b.k)] || []).push(b));
  const keys = GOJ.map(g => g[0]).filter(g => groups[g]).concat(groups['他'] ? ['他'] : []);
  return `<p class="small">${list.length}件（全${S.brands.length}件）</p>
   <div class="kana">${keys.map(k => `<a href="#" data-g="${k}">${k}</a>`).join('')}</div>
   ${keys.map(k => `<div class="gidx" id="g-${k}">${k}行</div><ul class="list">${groups[k].map(b => `<li><a class="li" href="#brand/${encodeURIComponent(b.n)}"><div class="tx"><b>${esc(b.n)}${b.x ? '<span class="x">食い違い</span>' : ''}${b.empty ? '<span class="e">情報未登録</span>' : ''}${b.own ? '<span class="o">所有品あり</span>' : ''}</b><span>${esc(b.k)}${b.y ? '・' + esc(b.y) : ''}${b.c ? '・' + esc(b.c) : ''}</span></div><span class="arrow">›</span></a></li>`).join('')}</ul>`).join('')}`;
}
function srcLabel(keys) { return (keys || []).map(s => S.srcNames[s] || s).join('、'); }
function viewBrand(n) {
  const b = S.brands.find(x => x.n === n); if (!b) return '<p class="empty">見つかりません。</p>';
  setTitle(b.n, 'dict');
  const rel = S.items.filter(i => [i.name, fieldVal(i, 'brand'), fieldVal(i, 'mark')].join(' ').toLowerCase().includes(b.n.split(/[ (（/]/)[0].toLowerCase()));
  const row = (l, v, cls = '') => v ? `<div class="f"><dt>${l}</dt><dd class="${cls}">${esc(v)}</dd></div>` : '';
  return `<div class="card"><div><h2>${esc(b.n)}</h2><p class="small">${esc(b.k)}</p></div>
   <dl class="fields">${row('年代', b.y)}${row('国', b.c)}${row('特徴', b.f)}${row('刻印', b.m)}${row('関係', b.r)}${row('食い違い', b.x)}${row('所有品', typeof b.own === 'string' ? b.own : '')}<div class="f"><dt>出典</dt><dd class="small">${esc(srcLabel(b.s)) || '未登録'}</dd></div></dl>
   ${b.empty ? '<p class="small">ノートに名前しかないブランドです。調べたら、ここに書き足していきます。</p>' : ''}
   <a class="btn full" href="${rcjURL(b.n)}" target="_blank" rel="noopener">刻印辞典で確認</a>
   ${b.nb && b.nb.length ? `<details class="raw"><summary>ノートの原文（${b.nb.length}か所）</summary>${b.nb.map(s => `<div class="rawh">${esc(s.f)}／${esc(s.h)}</div><div class="rawt">${esc(s.t) || '（見出しだけ）'}</div>`).join('')}</details>` : ''}</div>
  ${rel.length ? `<div class="card"><h3>関係しそうな作品</h3><div class="grid">${rel.map(tile).join('')}</div></div>` : ''}`;
}
function viewMat(n) {
  const m = S.materials.find(x => x.n === n); if (!m) return '<p class="empty">見つかりません。</p>';
  setTitle(m.n, 'dict');
  const row = (l, v) => v ? `<div class="f"><dt>${l}</dt><dd>${esc(v)}</dd></div>` : '';
  return `<div class="card"><div><h2>${esc(m.n)}</h2><p class="small">${esc(m.e || '')}</p></div><dl class="fields">${row('年代', m.y)}${row('説明', m.f)}${row('使ったブランド・例', m.b)}${row('見分け方', m.id)}${row('食い違い・注意', m.x)}<div class="f"><dt>出典</dt><dd class="small">${esc(srcLabel(m.s)) || '未登録'}</dd></div></dl></div>`;
}

// ---------- 画面：資料棚 ----------
let srcQ = '';
function viewSources() {
  setTitle('資料');
  return `<p class="lead">預けた文章を、受け取ったままの全文で置いています。写真は、その資料の中に入っています。</p>
  <input class="search" id="sq" type="search" placeholder="資料の中の言葉で探す" value="${esc(srcQ)}" aria-label="資料を検索"><div id="res">${srcRes()}</div>`;
}
function srcRes() {
  const q = srcQ.trim().toLowerCase();
  const list = S.sources.filter(s => !q || (s.title + ' ' + s.text).toLowerCase().includes(q));
  return `<p class="small">${list.length}件</p>
  <ul class="list">${list.map(s => `<li><a class="li" href="#source/${s.key}"><div class="tx"><b>${esc(s.key)}　${esc(s.title)}</b><span>${esc(s.kind)}・${s.text.length.toLocaleString()}字${s.photoIds.length ? `・写真${s.photoIds.length}枚` : ''}</span></div><span class="arrow">›</span></a></li>`).join('')}</ul>`;
}
function viewSource(key) {
  const s = S.sources.find(x => x.key === key); if (!s) return '<p class="empty">見つかりません。</p>';
  setTitle(s.title, 'sources');
  return `<div class="row"><span class="tag t-${s.kind === 'AIの回答' ? 'ai' : s.kind === '自分のノート' ? 'guess' : 'doc'}">${esc(s.kind)}</span><span class="small">資料${esc(s.key)}</span></div>
  ${s.photoIds.length ? `<div class="card"><h3>この資料の写真（${s.photoIds.length}枚）</h3><div class="photos">${s.photoIds.map(pid => `<button class="ph" type="button" data-view="${pid}"><img data-thumb="${pid}" alt=""></button>`).join('')}</div><p class="small">写真を押すと大きく見られます。「この写真から作品を作る」もできます。</p></div>` : ''}
  <div class="srctext">${esc(s.text)}</div>`;
}

// ---------- 画面：確認 ----------
let ucGroup = 'ask';
function viewCheck() {
  setTitle('確認');
  const pend = S.items.filter(i => i.confirm === 'pending');
  const groups = {}; S.unconfirmed.forEach(u => (groups[u.group] = groups[u.group] || { title: u.groupTitle, list: [] }).list.push(u));
  const g = groups[ucGroup] || { list: [] };
  const open = S.unconfirmed.filter(u => u.status === 'open').length;
  return `<div class="card"><h3>写真とメモの組み合わせ（${pend.length}件）</h3>
   <p class="lead">私が推定で組み合わせたものです。1件ずつ見て、合っているかどうかを押してください。</p>
   ${pend.length ? `<a class="btn primary full" href="#confirm">確かめ始める</a>` : '<p class="empty">確認待ちはありません。</p>'}</div>
  <div class="card"><h3>未確認リスト（残り${open}件／全${S.unconfirmed.length}件）</h3>
   <p class="lead">資料どうしの食い違い、AIの回答で裏付けのないこと、あなたの推測など。確かめたら「解決」を押すと、ここから消えます。</p>
   <div class="chips">${Object.entries(groups).map(([k, v]) => `<button class="chip" data-ug="${k}" aria-pressed="${ucGroup === k}">${esc(v.title)} ${v.list.filter(u => u.status === 'open').length}</button>`).join('')}</div>
   <ul class="list">${g.list.map(u => `<li class="li" style="display:grid;gap:6px"><div class="tx"><b>${esc(u.title)}</b>${u.sub ? `<span>${esc(u.sub)}</span>` : ''}${u.detail ? `<span>${esc(u.detail)}</span>` : ''}${u.note ? `<span>メモ：${esc(u.note)}</span>` : ''}</div>
     <div class="ustat" role="group" aria-label="状態">${[['open', '未確認'], ['hold', '保留'], ['done', '解決']].map(([k, l]) => `<button class="chip" data-us="${u.id}" data-v="${k}" aria-pressed="${u.status === k}">${l}</button>`).join('')}<button class="chip" data-un="${u.id}">メモ</button></div></li>`).join('')}</ul></div>`;
}
const skipped = new Set();
const pendList = () => { const p = S.items.filter(i => i.confirm === 'pending'); const w = i => (skipped.has(i.id) ? 2 : 0) + (i.photoIds.length ? 0 : 1); return p.map((x, n) => [x, n]).sort((a, b) => w(a[0]) - w(b[0]) || a[1] - b[1]).map(x => x[0]); };
function viewConfirm() {
  setTitle('写真とメモの確認', 'check');
  const pend = pendList();
  if (!pend.length) return '<p class="empty">確認待ちはありません。おつかれさまでした。</p><a class="btn" href="#check">確認の画面へ戻る</a>';
  const it = pend[0]; const p = mainPhoto(it);
  const fl = FIELDS.filter(([k]) => it.fields?.[k]?.v);
  return `<p class="small">残り${pend.length}件</p>
  <div class="card confirm">${p ? `<img data-thumb="${p}" alt="">` : '<p class="empty">まだ写真が入っていません。「未整理の写真」から選んでください。</p>'}
   <h2>${esc(it.name)}</h2><p class="lead">${esc(it.confirmNote)}</p>
   <dl class="fields">${fl.map(([k, l]) => `<div class="f"><dt>${l}</dt><dd>${esc(it.fields[k].v)} ${certTag(it.fields[k].c)}</dd></div>`).join('')}</dl>
   <div class="acts">${p ? `<button class="btn primary" data-cf="ok">合っている</button><button class="btn" data-cf="ng">写真が違う</button>` : `<a class="btn primary" href="#item/${it.id}">写真を選ぶ</a><button class="btn" data-cf="skip">あとで</button>`}</div>
   <div class="row"><a class="btn sm grow" href="#item/${it.id}/edit">内容を直す</a><button class="btn sm grow" data-cf="skip">あとで</button></div></div>`;
}
async function doConfirm(v) {
  const it = pendList()[0]; if (!it) return; const t = nowISO();
  if (v === 'ok') { it.confirm = 'ok'; it.history.push({ at: t, text: '写真とメモの組み合わせを確認した（合っている）' }); }
  else if (v === 'ng') {
    for (const pid of [...it.photoIds]) { const p = photoById(pid); if (p) { p.itemId = null; p.sourceKey = null; p.updated = t; await DB.put('photos', p); } }
    it.photoIds = []; it.confirm = 'pending'; it.confirmNote = '写真が違っていました。「未整理の写真」から正しい写真を選んで入れてください。';
    it.history.push({ at: t, text: '写真とメモの組み合わせが違っていた。写真を「未整理の写真」に戻した' });
  } else skipped.add(it.id);
  if (v !== 'skip') { it.updated = t; await DB.put('items', it); await changed(); }
  route();
}

// ---------- 画面：保存 ----------
function viewSave() {
  setTitle('保存');
  const last = S.kv.lastBackup, full = S.kv.lastFullBackup;
  const missing = S.photos.length ? null : 0;
  return `<div class="card"><h3>いまの状態</h3><dl class="kv"><dt>作品</dt><dd>${S.items.length}件</dd><dt>写真</dt><dd>${S.photos.length}枚</dd><dt>資料</dt><dd>${S.sources.length}件</dd>
   <dt>iCloudに保存</dt><dd>${last ? fmtDate(last) : 'まだ'}</dd><dt>写真ごと保存</dt><dd>${full ? fmtDate(full) : 'まだ'}</dd><dt>未保存の変更</dt><dd>${S.kv.changes || 0}件</dd><dt>このiPhoneで使っている容量</dt><dd id="quota">計算中…</dd></dl></div>
  <div class="card"><h3>iCloud Driveに保存する</h3>
   <button class="btn primary full" data-export="full">写真もまとめて保存</button>
   <button class="btn full" data-export="text">文章だけ保存（軽い・ふだん用）</button>
   <ol class="steps small"><li>ボタンを押すと、iPhoneの共有の画面が出ます。</li><li>「“ファイル”に保存」を押し、「iCloud Drive」の「ブローチ研究」フォルダを選んで「保存」。</li><li>ふだんは「文章だけ」、ときどき（月に1回など）「写真も」がおすすめです。</li></ol>
   <div id="expprog" hidden><div class="prog"><i></i></div><p class="small" id="exptext"></p></div></div>
  <div class="card"><h3>読み込む</h3><p class="lead">保存したファイルや初期データを読み込みます。同じ作品は、新しいほうが残ります。</p>
   <button class="btn full" id="import">ファイルを選んで読み込む</button><div id="impprog" hidden><div class="prog"><i></i></div><p class="small" id="imptext"></p></div></div>
  <div class="card"><h3>ホーム画面に追加する</h3><ol class="steps small"><li>Safariでこのページを開いた状態で、下の「…」または共有のボタンを押します。</li><li>「ホーム画面に追加」を押し、名前が「ブローチ研究」になっていることを確かめて「追加」。</li><li>次からはホーム画面のアイコンから開きます（データはアイコンから開いたほうに入ります）。</li></ol></div>
  <div class="card"><h3>そのほか</h3><button class="btn danger full" id="wipe">このiPhoneのデータをすべて消す</button><p class="small">消す前に、必ず「写真もまとめて保存」をしてください。アプリの版：${VERSION}</p></div>`;
}
async function doExport(withPhotos) {
  const box = $('#expprog'); box.hidden = false; const bar = box.querySelector('i'); const tx = $('#exptext');
  try {
    const data = { format: 'brooch-research', version: 1, exportedAt: nowISO(), kind: withPhotos ? 'full' : 'text', items: S.items, photos: S.photos, sources: S.sources, brands: S.brands, materials: S.materials, unconfirmed: S.unconfirmed, ideas: S.ideas, srcNames: S.srcNames, ...Object.fromEntries(MORE_STORES.map(k => [k, S[k]])) };
    const entries = [{ name: 'data.json', blob: new Blob([JSON.stringify(data)], { type: 'application/json' }) }];
    tx.textContent = '写真を集めています…';
    for (const p of S.photos) {
      const b = await DB.get('blobs', p.id); if (!b) continue;
      if (b.thumb) entries.push({ name: `thumbs/${p.id}.jpg`, blob: b.thumb });
      if (withPhotos && b.orig) entries.push({ name: `photos/${p.id}.${p.ext || 'jpg'}`, blob: b.orig });
    }
    const zip = await Zip.write(entries, (i, n) => { bar.style.width = (i / n * 100) + '%'; tx.textContent = `まとめています ${i}/${n}`; });
    const name = `ブローチ研究_${today()}${withPhotos ? '_写真あり' : '_文章'}.zip`;
    const file = new File([zip], name, { type: 'application/zip' });
    bar.style.width = '100%';
    tx.textContent = `${(file.size / 1048576).toFixed(1)}MB のファイルができました。下のボタンを押し、共有の画面で「“ファイル”に保存」→「iCloud Drive」を選んでください。`;
    const btn = document.createElement('button'); btn.className = 'btn primary full'; btn.textContent = 'iCloud Driveに保存する（共有の画面を開く）'; box.appendChild(btn);
    const done = async () => { await setKV('lastBackup', nowISO()); if (withPhotos) await setKV('lastFullBackup', nowISO()); await setKV('changes', 0); updateSaveChip(); toast('保存しました'); setTimeout(route, 600); };
    btn.onclick = () => {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).then(done, e => { tx.textContent = e.name === 'AbortError' ? '保存をやめました。もう一度ボタンを押せば保存できます。' : '共有の画面を開けませんでした：' + e.message; });
      } else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); done(); }
    };
  } catch (e) { tx.textContent = '保存できませんでした：' + e.message; }
}
async function doImport(files) {
  const box = $('#impprog'); if (box) box.hidden = false; const bar = box?.querySelector('i'); const tx = $('#imptext') || { textContent: '' };
  const prog = (t, r) => { if (bar) bar.style.width = (r * 100) + '%'; tx.textContent = t; toast(t, 4000); };
  let nItems = 0, nPhotos = 0, nOrig = 0, nMore = 0;
  try {
    for (const [fi, file] of [...files].entries()) {
      prog(`${file.name} を開いています（${fi + 1}/${files.length}）`, 0);
      const entries = await Zip.read(file);
      const dj = entries.find(e => e.name === 'data.json');
      if (dj) {
        const d = JSON.parse(await dj.blob.text());
        if (d.format !== 'brooch-research') throw new Error('ブローチ研究のファイルではありません');
        const merge = async (store, arr, key) => {
          const cur = new Map(S[store].map(x => [x[key], x])); const put = [];
          for (const x of arr || []) { const c = cur.get(x[key]); if (!c || (x.updated || '') > (c.updated || '')) { cur.set(x[key], x); put.push(x); } }
          if (put.length) await DB.putMany(store, put); S[store] = [...cur.values()]; return put.length;
        };
        nItems += await merge('items', d.items, 'id');
        nPhotos += await merge('photos', d.photos, 'id');
        for (const k of MORE_STORES) if (d[k]) nMore += await merge(k, d[k], 'id');
        await merge('sources', d.sources, 'key'); await merge('brands', d.brands, 'n'); await merge('materials', d.materials, 'n');
        // 未確認リストは、手元で変えた状態を優先
        const uc = new Map(S.unconfirmed.map(u => [u.id, u])); const put = [];
        for (const u of d.unconfirmed || []) if (!uc.has(u.id) || (u.changed || '') > (uc.get(u.id).changed || '')) { uc.set(u.id, u); put.push(u); }
        if (put.length) await DB.putMany('unconfirmed', put); S.unconfirmed = [...uc.values()];
        if (d.ideas) await setKV('ideas', d.ideas); if (d.srcNames) await setKV('srcNames', d.srcNames);
        S.ideas = S.kv.ideas || []; S.srcNames = S.kv.srcNames || {}; S.sources.sort((a, b) => a.key.localeCompare(b.key));
      }
      const media = entries.filter(e => /^(photos|thumbs)\//.test(e.name));
      for (const [i, e] of media.entries()) {
        const [dir, fn] = e.name.split('/'); const id = fn.replace(/\.[^.]+$/, '');
        const ext = fn.split('.').pop().toLowerCase();
        const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const blob = new Blob([await e.blob.arrayBuffer()], { type });
        const cur = (await DB.get('blobs', id)) || { id };
        if (dir === 'photos') { cur.orig = blob; nOrig++; } else cur.thumb = blob;
        await DB.put('blobs', cur); urlCache.delete('t' + id); urlCache.delete('o' + id);
        if (i % 10 === 0) prog(`${file.name}：写真 ${i + 1}/${media.length}`, (i + 1) / media.length);
      }
    }
    if (!S.kv.lastBackup) await setKV('changes', 0);
    try { await navigator.storage?.persist?.(); } catch (e) { }
    prog('読み込みました（' + [nItems && `作品${nItems}件`, nPhotos && `写真の情報${nPhotos}件`, nOrig && `元の写真${nOrig}枚`, nMore && `調べるの記録${nMore}件`].filter(Boolean).join('・') + '）', 1);
    updateSaveChip(); setTimeout(() => { location.hash = nMore && !nItems ? 'study' : 'items'; route(); }, 600);
  } catch (e) { prog('読み込めませんでした：' + e.message, 0); }
}

// ---------- 画面の切り替え ----------
async function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'items';
  const [a, b, c] = h.split('/');
  const tab = { ...MORE_TABS, items: 'items', item: 'items', unsorted: 'items', dict: 'dict', brand: 'dict', mat: 'dict', sources: 'study', source: 'study', check: 'check', confirm: 'check', save: 'save' }[a] || 'items';
  document.querySelectorAll('.tabs a').forEach(x => x.dataset.tab === tab ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
  let html;
  if (!S.items.length && !S.sources.length && a !== 'save') html = viewWelcome();
  else if (a === 'item' && c === 'edit') html = viewEdit(b);
  else if (a === 'item') html = viewItem(b);
  else if (a === 'unsorted') html = viewUnsorted();
  else if (a === 'dict') html = viewDict();
  else if (a === 'brand') html = viewBrand(h.slice(6));
  else if (a === 'mat') html = viewMat(h.slice(4));
  else if (a === 'sources') html = viewSources();
  else if (a === 'source') html = viewSource(b);
  else if (a === 'check') html = viewCheck();
  else if (a === 'confirm') html = viewConfirm();
  else if (a === 'save') html = viewSave();
  else if (MORE_VIEWS[a]) html = MORE_VIEWS[a](b, c, h);
  else html = viewItems();
  const main = $('#main'); main.innerHTML = html; bind(a, b, c); fillThumbs(main);
  if (route.last !== h) { window.scrollTo(0, 0); route.last = h; }
  updateSaveChip();
}
function bind(a, b, c) {
  const m = $('#main');
  moreBind(a, b, c, m);
  const on = (sel, ev, fn) => m.querySelectorAll(sel).forEach(el => el[ev] = fn);
  on('#wimport', 'onclick', () => $('#pickZip').click());
  on('#import', 'onclick', () => $('#pickZip').click());
  on('#wempty', 'onclick', async () => { S.sources = [{ key: '00', title: 'メモ', kind: '自分のノート', text: '', photoIds: [] }]; await DB.put('sources', S.sources[0]); route(); });
  on('#newitem', 'onclick', () => location.hash = 'item/new/edit');
  on('[data-f]', 'onclick', e => { itemFilter = e.currentTarget.dataset.f; route(); });
  const live = (sel, set, fn) => on(sel, 'oninput', e => { set(e.target.value); clearTimeout(live.t); live.t = setTimeout(() => { const r = $('#res'); r.innerHTML = fn(); bindRes(); fillThumbs(r); }, 180); });
  const bindRes = () => { m.querySelectorAll('#res [data-f]').forEach(el => el.onclick = e => { itemFilter = e.currentTarget.dataset.f; route(); }); m.querySelectorAll('#res [data-g]').forEach(el => el.onclick = e => { e.preventDefault(); document.getElementById('g-' + e.currentTarget.dataset.g)?.scrollIntoView(); }); };
  live('#iq', v => itemQ = v, itemsRes); live('#dq', v => dictQ = v, dictRes); live('#sq', v => srcQ = v, srcRes);
  on('[data-view]', 'onclick', e => openViewer(e.currentTarget.dataset.view, e.currentTarget.dataset.item));
  on('#addph', 'onclick', () => { pickTarget = b; $('#pickPhoto').click(); });
  on('#addun', 'onclick', () => { pickTarget = null; $('#pickPhoto').click(); });
  on('#fromun', 'onclick', () => pickUnsortedFor(b));
  on('#gem', 'onclick', () => {
    const it = itemById(b); const q = fieldVal(it, 'search') || defaultQuery(it);
    try { navigator.clipboard.writeText(q).then(() => toast('検索語をコピーしました。Gemの検索欄に貼り付けてください'), () => toast('検索語：' + q, 6000)); } catch (e) { toast('検索語：' + q, 6000); }
  });
  on('#delitem', 'onclick', () => confirmSheet('この作品を削除しますか？写真は「未整理の写真」に戻ります。', '削除する', async () => {
    const it = itemById(b); for (const pid of it.photoIds) { const p = photoById(pid); if (p) { p.itemId = null; p.updated = nowISO(); await DB.put('photos', p); } }
    await DB.del('items', b); S.items = S.items.filter(x => x.id !== b); await changed(); toast('削除しました'); location.hash = 'items';
  }, true));
  const form = m.querySelector('#editform');
  if (form) {
    form.onsubmit = e => { e.preventDefault(); saveEdit(b, form); };
    form.querySelectorAll('[data-cert]').forEach(btn => btn.onclick = () => {
      const k = btn.dataset.cert; form.querySelector(`[name="c-${k}"]`).value = btn.dataset.c;
      form.querySelectorAll(`[data-cert="${k}"]`).forEach(x => x.setAttribute('aria-pressed', x === btn));
    });
  }
  on('[data-dt]', 'onclick', e => { dictTab = e.currentTarget.dataset.dt; dictQ = ''; route(); });
  on('[data-g]', 'onclick', e => { e.preventDefault(); document.getElementById('g-' + e.currentTarget.dataset.g)?.scrollIntoView(); });
  on('[data-ug]', 'onclick', e => { ucGroup = e.currentTarget.dataset.ug; route(); });
  on('[data-us]', 'onclick', async e => { const u = S.unconfirmed.find(x => x.id === e.currentTarget.dataset.us); u.status = e.currentTarget.dataset.v; u.changed = nowISO(); await DB.put('unconfirmed', u); await changed(); route(); });
  on('[data-un]', 'onclick', e => { const u = S.unconfirmed.find(x => x.id === e.currentTarget.dataset.un);
    sheet(`<h2>${esc(u.title)}</h2><div class="fld"><label for="unote">メモ（調べたこと・分かったこと）</label><textarea id="unote">${esc(u.note || '')}</textarea></div><button class="btn primary" id="usave">保存</button>`, el => {
      el.querySelector('#usave').onclick = async () => { u.note = el.querySelector('#unote').value; u.changed = nowISO(); await DB.put('unconfirmed', u); await changed(); closeSheet(); route(); };
    }); });
  on('[data-cf]', 'onclick', e => doConfirm(e.currentTarget.dataset.cf));
  on('[data-export]', 'onclick', e => doExport(e.currentTarget.dataset.export === 'full'));
  on('#wipe', 'onclick', () => confirmSheet('このiPhoneのデータをすべて消しますか？元に戻せません。', 'すべて消す', async () => { await DB.clearAll(); location.reload(); }, true));
  const qe = m.querySelector('#quota');
  if (qe) navigator.storage?.estimate?.().then(r => qe.textContent = `${(r.usage / 1048576).toFixed(0)}MB（使える量の目安 ${(r.quota / 1073741824).toFixed(1)}GB）`).catch(() => qe.textContent = '分かりません');
}
let pickTarget = null;
function pickUnsortedFor(itemId) {
  const list = S.photos.filter(p => !p.itemId && !p.sourceKey);
  sheet(`<h2>未整理の写真から選ぶ</h2>${list.length ? `<div class="grid">${list.map(p => `<button class="tile" type="button" data-pick="${p.id}"><div class="ph"><img data-thumb="${p.id}" alt=""></div><div class="mk">${esc(p.name)}</div></button>`).join('')}</div>` : '<p class="empty">未整理の写真はありません。</p>'}<button class="btn" id="pclose">閉じる</button>`, el => {
    fillThumbs(el); el.querySelector('#pclose').onclick = closeSheet;
    el.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = async () => { closeSheet(); await linkPhoto(btn.dataset.pick, itemId); pickPart(btn.dataset.pick, itemId); });
  });
}
$('#pickPhoto').onchange = async e => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  toast('写真を入れています…'); const ids = await addPhotos(files, pickTarget);
  if (pickTarget && ids.length === 1) pickPart(ids[0], pickTarget); else { toast(`写真を${ids.length}枚入れました`); route(); }
};
$('#pickZip').onchange = async e => { const files = [...e.target.files]; e.target.value = ''; if (!files.length) return; if (!location.hash.includes('save')) { location.hash = 'save'; await new Promise(r => setTimeout(r, 150)); } doImport(files); };
window.addEventListener('hashchange', route);

(async () => {
  try { await loadAll(); } catch (e) { $('#main').innerHTML = `<div class="card"><h2>データを開けませんでした</h2><p class="lead">${esc(e.message)}</p><p class="small">Safariの「プライベート」では使えません。通常のタブで開いてください。</p></div>`; return; }
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
