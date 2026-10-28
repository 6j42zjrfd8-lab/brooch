'use strict';
// 「調べる」の部分：手がかりの逆引き・謎と問い・読みもの・年表・価格の記録・セット
const MORE_STORES = ['clues', 'questions', 'reading', 'timeline', 'prices', 'sets'];
const MORE_TABS = { study: 'study', clues: 'study', clue: 'study', questions: 'study', question: 'study', reading: 'study', read: 'study', timeline: 'study', prices: 'study', price: 'study', sets: 'study', set: 'study', sources: 'study', source: 'study' };
const QSTAT = { open: '未解決', hold: '保留', done: '解決' };
const TL_TYPE = { brand: 'ブランド', person: '人物', material: '素材・技術', law: '法律・特許', war: '戦争・社会', style: '様式', mine: '自分の作品' };
const SET_KIND = ['ブローチ', 'イヤリング', 'ネックレス', 'ブレスレット', '指輪', 'その他'];
const SET_STATE = { own: '所有', seen: '見かけた', want: '探している' };

async function putRec(store, rec, text) {
  rec.updated = nowISO(); if (!rec.created) rec.created = rec.updated;
  if (text) (rec.history = rec.history || []).push({ at: rec.updated, text });
  await DB.put(store, rec);
  const i = S[store].findIndex(x => x.id === rec.id); if (i >= 0) S[store][i] = rec; else S[store].push(rec);
  await changed();
}
async function delRec(store, id) { await DB.del(store, id); S[store] = S[store].filter(x => x.id !== id); await changed(); }
const srcLink = keys => (keys || []).map(k => S.sources.find(s => s.key === k) ? `<a href="#source/${k}">資料${k}</a>` : esc(S.srcNames[k] || k)).join('、');
const certSel = (name, c) => `<div class="cert" role="group" aria-label="確かさ">${Object.entries(CERT).map(([k, l]) => `<button type="button" class="t-${k}" data-csel="${name}" data-c="${k}" aria-pressed="${(c || 'unk') === k}">${l}</button>`).join('')}</div><input type="hidden" name="${name}" value="${c || 'unk'}">`;
function bindCert(root) {
  root.querySelectorAll('[data-csel]').forEach(b => b.onclick = () => {
    const n = b.dataset.csel; root.querySelector(`input[name="${n}"]`).value = b.dataset.c;
    root.querySelectorAll(`[data-csel="${n}"]`).forEach(x => x.setAttribute('aria-pressed', x === b));
  });
}
const itemText = it => [it.name, ...Object.values(it.fields || {}).map(f => f.v)].join(' ');
function pickItems(title, onPick, exclude = []) {
  const list = S.items.filter(i => !exclude.includes(i.id)).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  sheet(`<h2>${esc(title)}</h2><input class="search" id="xq" type="search" placeholder="作品の名前で探す"><ul class="list" id="xl"></ul><button class="btn" id="xc">閉じる</button>`, el => {
    const draw = () => { const q = el.querySelector('#xq').value.toLowerCase(); el.querySelector('#xl').innerHTML = list.filter(i => !q || itemText(i).toLowerCase().includes(q)).slice(0, 80).map(i => `<li><button class="li" style="width:100%" data-xi="${i.id}">${mainPhoto(i) ? `<img data-thumb="${mainPhoto(i)}" alt="">` : ''}<div class="tx"><b>${esc(i.name || '名前なし')}</b><span>${KIND[i.kind] || ''}・${esc(fieldVal(i, 'mark'))}</span></div></button></li>`).join(''); fillThumbs(el); };
    draw(); el.querySelector('#xq').oninput = draw; el.querySelector('#xc').onclick = closeSheet;
    el.querySelector('#xl').onclick = e => { const b = e.target.closest('[data-xi]'); if (b) { closeSheet(); onPick(b.dataset.xi); } };
  });
}
const yen = n => (Number(n) || 0).toLocaleString('ja-JP');

// ---------- 調べる（入口） ----------
function viewStudy() {
  setTitle('調べる');
  const openQ = S.questions.filter(q => q.status !== 'done').length;
  const card = (href, t, d, n) => `<li><a class="li" href="#${href}"><div class="tx"><b>${t}</b><span>${d}</span></div><span class="small">${n}</span><span class="arrow">›</span></a></li>`;
  return `<ul class="list">
   ${card('clues', '手がかりの逆引き', '裏で見えたもの（番号・金具・刻印・金属の色など）から、候補と根拠・反論をたどる', S.clues.length + '件')}
   ${card('questions', '謎と問い', 'ひとつずつの問いに、賛成と反対の根拠、次に調べることを並べる', `未解決${openQ}`)}
   ${card('reading', '読みもの', '業界の仕組み・時代・国・発明・素材の科学を、ノートからまとめて読む', S.reading.length + '本')}
   ${card('timeline', '年表', '創業と閉業、人の移籍、素材の登場、法律、戦争を一本の流れに', S.timeline.length + '件')}
   ${card('prices', '価格の記録', '買った値段と、見かけた品の値段と時点', S.prices.length + itemPrices().length + '件')}
   ${card('sets', 'セット（デミパリュール）', 'ブローチ・イヤリング・ネックレスを同じページに並べる', S.sets.length + '組')}
   ${card('sources', '資料棚', '預けた文章の全文と、それぞれの写真', S.sources.length + '件')}
  </ul>
  ${!S.clues.length ? '<div class="card"><b>「調べる」のデータがまだ入っていません</b><p class="lead">「保存」の画面から「ブローチ研究_追加データ」のファイルを読み込むと、手がかり・問い・読みもの・年表・価格の記録が入ります。</p><a class="btn sm" href="#save">保存の画面へ</a></div>' : ''}`;
}

// ---------- 手がかりの逆引き ----------
let clueCat = 'all', clueQ = '';
function clueMatches(cl) {
  if (!cl.match) return [];
  let re; try { re = new RegExp(cl.match, 'i'); } catch (e) { return []; }
  return S.items.filter(i => re.test(itemText(i)));
}
function viewClues() {
  setTitle('手がかりの逆引き', 'study');
  const cats = [...new Set(S.clues.map(c => c.cat))];
  return `<p class="lead">作品の裏で見えたものから引きます。候補には、根拠と反論、確かさの印が付いています。候補は「決め手」ではなく、調べる入口です。</p>
  <input class="search" id="clq" type="search" placeholder="例：トロンボーン、A2100、©、赤茶" value="${esc(clueQ)}" aria-label="手がかりを探す">
  <div class="chips">${[['all', 'すべて'], ...cats.map(c => [c, c])].map(([k, l]) => `<button class="chip" data-clc="${esc(k)}" aria-pressed="${clueCat === k}">${esc(l)}</button>`).join('')}</div>
  <div id="res">${cluesRes()}</div>
  <button class="btn" id="newclue">＋ 手がかりを足す</button>`;
}
function cluesRes() {
  const q = clueQ.trim().toLowerCase();
  const list = S.clues.filter(c => (clueCat === 'all' || c.cat === clueCat) && (!q || JSON.stringify([c.t, c.d, c.cands, c.kw]).toLowerCase().includes(q) || (c.match && (() => { try { return new RegExp(c.match, 'i').test(clueQ); } catch (e) { return false; } })())));
  return `<p class="small">${list.length}件</p><ul class="list">${list.map(c => { const n = clueMatches(c).length; return `<li><a class="li" href="#clue/${c.id}"><div class="tx"><b>${esc(c.t)}</b><span>${esc(c.cat)}・候補 ${(c.cands || []).map(x => esc(x.to)).join('／')}</span></div>${n ? `<span class="o">作品${n}</span>` : ''}<span class="arrow">›</span></a></li>`; }).join('')}</ul>`;
}
function viewClue(id) {
  const c = S.clues.find(x => x.id === id); if (!c) return '<p class="empty">見つかりません。</p>';
  setTitle(c.t, 'clues');
  const m = clueMatches(c);
  return `<div class="card"><span class="small">${esc(c.cat)}</span><h2>${esc(c.t)}</h2>${c.d ? `<p>${esc(c.d)}</p>` : ''}${c.src ? `<p class="small">出典：${srcLink(c.src)}</p>` : ''}</div>
  <div class="card"><h3>候補</h3><ul class="list">${(c.cands || []).map((x, i) => `<li class="card" style="gap:6px"><div class="row"><b class="grow">${esc(x.to)}</b>${certTag(x.c)}</div>
    ${x.why ? `<div><span class="small">根拠</span><div>${esc(x.why)}</div></div>` : ''}${x.against ? `<div><span class="small">反論・注意</span><div>${esc(x.against)}</div></div>` : ''}
    ${x.src ? `<p class="small">出典：${srcLink(x.src)}</p>` : ''}<div class="row"><button class="btn sm" data-cand-edit="${i}">直す</button></div></li>`).join('')}</ul>
   <button class="btn sm" id="addcand">＋ 候補を足す</button></div>
  ${c.note ? `<div class="card"><h3>メモ</h3><p style="white-space:pre-wrap">${esc(c.note)}</p></div>` : ''}
  <div class="card"><h3>当てはまりそうな自分の作品（${m.length}）</h3><p class="small">作品の記録の言葉から自動で探しています。当てはまるとは限りません。</p>${m.length ? `<div class="grid">${m.map(tile).join('')}</div>` : '<p class="empty">いまはありません。</p>'}</div>
  <div class="row"><button class="btn sm" id="editclue">手がかりを直す</button><button class="btn sm danger" id="delclue">削除</button></div>`;
}
function editClueSheet(c) {
  const n = !c; c = c || { id: uid('c-'), cat: '自分で足した手がかり', t: '', d: '', match: '', note: '', cands: [] };
  sheet(`<h2>${n ? '手がかりを足す' : '手がかりを直す'}</h2><form class="edit" id="cf">
   <div class="fld"><label for="c-t">見えたもの</label><input id="c-t" name="t" value="${esc(c.t)}" placeholder="例：裏にジグザグの縫い目のような模様"></div>
   <div class="fld"><label for="c-cat">分類</label><input id="c-cat" name="cat" value="${esc(c.cat)}" list="catlist"><datalist id="catlist">${[...new Set(S.clues.map(x => x.cat))].map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
   <div class="fld"><label for="c-d">説明</label><textarea id="c-d" name="d">${esc(c.d)}</textarea></div>
   <div class="fld"><label for="c-m">作品を探す言葉（「|」で区切ると、どれかに当たれば表示）</label><input id="c-m" name="match" value="${esc(c.match)}" placeholder="例：ジグザグ|縫い"></div>
   <div class="fld"><label for="c-n">メモ</label><textarea id="c-n" name="note">${esc(c.note)}</textarea></div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button><button class="btn grow" type="button" id="cx">やめる</button></div></form>`, el => {
    el.querySelector('#cx').onclick = closeSheet;
    el.querySelector('#cf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); if (!f.get('t').trim()) { toast('「見えたもの」を書いてください'); return; }
      Object.assign(c, { t: f.get('t').trim(), cat: f.get('cat').trim() || '自分で足した手がかり', d: f.get('d').trim(), match: f.get('match').trim(), note: f.get('note').trim() });
      await putRec('clues', c, n ? '足した' : '直した'); closeSheet(); location.hash = 'clue/' + c.id; route(); };
  });
}
function editCandSheet(c, idx) {
  const x = idx === undefined ? { to: '', why: '', against: '', c: 'guess' } : c.cands[idx];
  sheet(`<h2>${idx === undefined ? '候補を足す' : '候補を直す'}</h2><form class="edit" id="kf">
   <div class="fld"><label for="k-to">候補（ブランド・国・年代など）</label><input id="k-to" name="to" value="${esc(x.to)}"></div>
   <div class="fld"><label for="k-w">根拠</label><textarea id="k-w" name="why">${esc(x.why)}</textarea></div>
   <div class="fld"><label for="k-a">反論・注意</label><textarea id="k-a" name="against">${esc(x.against)}</textarea></div>
   <div class="fld"><label>確かさ</label>${certSel('c', x.c)}</div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button>${idx === undefined ? '' : '<button class="btn danger" type="button" id="kdel">消す</button>'}<button class="btn grow" type="button" id="kx">やめる</button></div></form>`, el => {
    bindCert(el); el.querySelector('#kx').onclick = closeSheet;
    el.querySelector('#kdel')?.addEventListener('click', async () => { c.cands.splice(idx, 1); await putRec('clues', c, `候補「${x.to}」を消した`); closeSheet(); route(); });
    el.querySelector('#kf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const v = { ...x, to: f.get('to').trim(), why: f.get('why').trim(), against: f.get('against').trim(), c: f.get('c') };
      if (!v.to) { toast('候補を書いてください'); return; }
      c.cands = c.cands || []; if (idx === undefined) c.cands.push(v); else c.cands[idx] = v;
      await putRec('clues', c, idx === undefined ? `候補「${v.to}」を足した` : `候補「${x.to}」を直した（${CERT[x.c] || ''}→${CERT[v.c]}）`); closeSheet(); route(); };
  });
}

// ---------- 謎と問い ----------
let qStat = 'open';
function viewQuestions() {
  setTitle('謎と問い', 'study');
  const list = S.questions.filter(q => qStat === 'all' || (q.status || 'open') === qStat).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const cnt = k => S.questions.filter(q => (q.status || 'open') === k).length;
  return `<p class="lead">ノートの「〜でしょー」「ほんま？？」のような問いを、ひとつずつ立てています。賛成と反対の根拠を並べ、解けたら「解決」にします。</p>
  <div class="chips">${[['open', `未解決 ${cnt('open')}`], ['hold', `保留 ${cnt('hold')}`], ['done', `解決 ${cnt('done')}`], ['all', 'すべて']].map(([k, l]) => `<button class="chip" data-qs="${k}" aria-pressed="${qStat === k}">${l}</button>`).join('')}</div>
  <ul class="list">${list.map(q => `<li><a class="li" href="#question/${q.id}"><div class="tx"><b>${esc(q.q)}</b><span>賛成 ${(q.ev || []).filter(e => e.side === 'for').length}・反対 ${(q.ev || []).filter(e => e.side === 'against').length}${q.items?.length ? `・作品${q.items.length}` : ''}</span></div><span class="arrow">›</span></a></li>`).join('') || '<p class="empty">ありません。</p>'}</ul>
  <button class="btn primary" id="newq">＋ 問いを立てる</button>`;
}
function viewQuestion(id) {
  const q = S.questions.find(x => x.id === id); if (!q) return '<p class="empty">見つかりません。</p>';
  setTitle('問い', 'questions');
  const ev = side => (q.ev || []).map((e, i) => [e, i]).filter(([e]) => e.side === side).map(([e, i]) => `<li class="li" style="display:grid;gap:4px"><div>${esc(e.t)} ${certTag(e.c)}</div>${e.src ? `<span class="small">出典：${srcLink(e.src)}</span>` : ''}${e.ref ? `<span class="small">出どころ：${esc(e.ref)}</span>` : ''}<div><button class="btn sm" data-ev="${i}">直す</button></div></li>`).join('') || '<p class="empty">まだありません。</p>';
  const its = (q.items || []).map(itemById).filter(Boolean);
  return `<div class="card"><div class="row"><span class="tag t-${q.status === 'done' ? 'fixed' : q.status === 'hold' ? 'seller' : 'unk'}">${QSTAT[q.status || 'open']}</span></div><h2>${esc(q.q)}</h2>${q.memo ? `<p style="white-space:pre-wrap">${esc(q.memo)}</p>` : ''}
   ${q.conclusion ? `<div class="card" style="border-color:var(--c-fixed)"><b>いまの結論</b><p style="white-space:pre-wrap;margin:0">${esc(q.conclusion)}</p></div>` : ''}
   <div class="chips">${Object.entries(QSTAT).map(([k, l]) => `<button class="chip" data-qset="${k}" aria-pressed="${(q.status || 'open') === k}">${l}にする</button>`).join('')}</div></div>
  <div class="card"><h3>そうだと言える根拠</h3><ul class="list">${ev('for')}</ul><button class="btn sm" data-evadd="for">＋ 根拠を足す</button></div>
  <div class="card"><h3>反対の根拠・注意</h3><ul class="list">${ev('against')}</ul><button class="btn sm" data-evadd="against">＋ 反対の根拠を足す</button></div>
  <div class="card"><h3>次に調べること</h3>${(q.next || []).length ? `<ol class="steps">${q.next.map(n => `<li>${esc(n)}</li>`).join('')}</ol>` : '<p class="empty">まだありません。</p>'}</div>
  <div class="card"><h3>関係する作品</h3>${its.length ? `<div class="grid">${its.map(tile).join('')}</div>` : '<p class="empty">まだ結び付いていません。</p>'}<button class="btn sm" id="qitem">＋ 作品を結び付ける</button></div>
  <div class="row"><a class="btn sm" href="#question/${q.id}/edit">問い・結論・次に調べることを直す</a><button class="btn sm danger" id="delq">削除</button></div>
  ${(q.history || []).length ? `<div class="card"><h3>履歴</h3><ul class="hist">${[...q.history].reverse().map(h => `<li><time>${fmtDate(h.at)} ${h.at.slice(11, 16)}</time>${esc(h.text)}</li>`).join('')}</ul></div>` : ''}`;
}
function viewQuestionEdit(id) {
  const n = id === 'new'; const q = n ? { q: '', memo: '', conclusion: '', next: [] } : S.questions.find(x => x.id === id);
  if (!q) return '<p class="empty">見つかりません。</p>';
  setTitle(n ? '問いを立てる' : '問いを直す', n ? 'questions' : 'question/' + id);
  return `<form class="edit" id="qf">
   <div class="fld"><label for="q-q">問い</label><textarea id="q-q" name="q" placeholder="例：A2100 の空飛ぶじゅうたんは Boucher か？">${esc(q.q)}</textarea></div>
   <div class="fld"><label for="q-m">メモ（いきさつ・気づいたこと）</label><textarea id="q-m" name="memo">${esc(q.memo)}</textarea></div>
   <div class="fld"><label for="q-n">次に調べること（1行に1つ）</label><textarea id="q-n" name="next">${esc((q.next || []).join('\n'))}</textarea></div>
   <div class="fld"><label for="q-c">いまの結論（分かったら）</label><textarea id="q-c" name="conclusion">${esc(q.conclusion)}</textarea></div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button><a class="btn grow" href="#${n ? 'questions' : 'question/' + id}">やめる</a></div></form>`;
}
function evSheet(q, side, idx) {
  const e = idx === undefined ? { side, t: '', c: 'guess', ref: '' } : q.ev[idx];
  sheet(`<h2>${e.side === 'for' ? '根拠' : '反対の根拠・注意'}</h2><form class="edit" id="ef">
   <div class="fld"><label for="e-t">内容</label><textarea id="e-t" name="t">${esc(e.t)}</textarea></div>
   <div class="fld"><label for="e-r">出どころ（本・サイト・自分の観察など）</label><input id="e-r" name="ref" value="${esc(e.ref || '')}"></div>
   <div class="fld"><label>確かさ</label>${certSel('c', e.c)}</div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button>${idx === undefined ? '' : '<button class="btn danger" type="button" id="edel">消す</button>'}<button class="btn grow" type="button" id="ex">やめる</button></div></form>`, el => {
    bindCert(el); el.querySelector('#ex').onclick = closeSheet;
    el.querySelector('#edel')?.addEventListener('click', async () => { q.ev.splice(idx, 1); await putRec('questions', q, `根拠を消した：「${e.t.slice(0, 40)}」`); closeSheet(); route(); });
    el.querySelector('#ef').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const v = { ...e, t: f.get('t').trim(), ref: f.get('ref').trim(), c: f.get('c') };
      if (!v.t) { toast('内容を書いてください'); return; }
      q.ev = q.ev || []; if (idx === undefined) q.ev.push(v); else q.ev[idx] = v;
      await putRec('questions', q, `${v.side === 'for' ? '根拠' : '反対の根拠'}を${idx === undefined ? '足した' : '直した'}：「${v.t.slice(0, 40)}」（${CERT[v.c]}）`); closeSheet(); route(); };
  });
}

// ---------- 読みもの ----------
function viewReading() {
  setTitle('読みもの', 'study');
  return `<p class="lead">預けてくださったノートと資料を、テーマごとに読める形にまとめ直したものです。段落ごとに確かさの印と出典を付けています。</p>
  <ul class="list">${[...S.reading].sort((a, b) => (a.order || 0) - (b.order || 0)).map(r => `<li><a class="li" href="#read/${r.id}"><div class="tx"><b>${esc(r.title)}</b><span>${esc(r.lead || '')}</span></div><span class="arrow">›</span></a></li>`).join('') || '<p class="empty">まだありません。</p>'}</ul>`;
}
function viewRead(id) {
  const r = S.reading.find(x => x.id === id); if (!r) return '<p class="empty">見つかりません。</p>';
  setTitle(r.title, 'reading');
  return `<article class="card" style="gap:14px"><h2>${esc(r.title)}</h2>${r.lead ? `<p class="lead">${esc(r.lead)}</p>` : ''}
   ${(r.sections || []).map(s => `<section style="display:grid;gap:8px"><h3 style="font-family:var(--f-display);font-size:17px">${esc(s.h)}</h3>${(s.p || []).map(p => `<p style="margin:0">${esc(p.t)} ${certTag(p.c)}${p.src?.length ? ` <span class="small">（${srcLink(p.src)}）</span>` : ''}</p>`).join('')}</section>`).join('')}
   ${r.note ? `<p class="small">${esc(r.note)}</p>` : ''}</article>`;
}

// ---------- 年表 ----------
let tlType = 'all', tlMine = true;
function itemYears() {
  return S.items.map(i => { const m = fieldVal(i, 'era').match(/(1[6-9]\d\d|20\d\d)/); return m ? { id: 'm-' + i.id, y: +m[1], t: `自分の作品：${i.name}（年代：${fieldVal(i, 'era')}）`, type: 'mine', c: i.fields.era.c, itemId: i.id } : null; }).filter(Boolean);
}
function viewTimeline() {
  setTitle('年表', 'study');
  const all = [...S.timeline, ...(tlMine ? itemYears() : [])].filter(e => tlType === 'all' || e.type === tlType).sort((a, b) => a.y - b.y || (a.y2 || a.y) - (b.y2 || b.y));
  const groups = {}; all.forEach(e => { const k = e.y < 1900 ? (Math.floor(e.y / 100) * 100) + '年代' : (Math.floor(e.y / 10) * 10) + '年代'; (groups[k] = groups[k] || []).push(e); });
  return `<p class="lead">年は資料に書かれた目安で、資料どうしで違うものは「食い違い」と書いています。作品の「年代」の欄に年を書くと、自分の作品もここに並びます。</p>
  <div class="chips">${[['all', 'すべて'], ...Object.entries(TL_TYPE)].map(([k, l]) => `<button class="chip" data-tt="${k}" aria-pressed="${tlType === k}">${l}</button>`).join('')}</div>
  <label class="row small"><input type="checkbox" id="tlmine" ${tlMine ? 'checked' : ''}> 自分の作品も並べる</label>
  <div class="kana">${Object.keys(groups).map(k => `<a href="#" data-tg="${k}">${k.replace('年代', '')}</a>`).join('')}</div>
  ${Object.entries(groups).map(([k, es]) => `<div class="gidx" id="tg-${k}">${k}</div><ul class="hist">${es.map(e => `<li><time>${e.y}${e.y2 && e.y2 !== e.y ? '〜' + e.y2 : ''}年・${TL_TYPE[e.type] || ''}</time><div>${e.itemId ? `<a href="#item/${e.itemId}">${esc(e.t)}</a>` : esc(e.t)} ${certTag(e.c)}${e.x ? ' <span class="x">食い違い</span>' : ''}${e.src?.length ? ` <span class="small">${srcLink(e.src)}</span>` : ''}${e.brand ? ` <a class="small" href="#brand/${encodeURIComponent(e.brand)}">辞典</a>` : ''}${e.user ? ` <button class="chip" data-tled="${e.id}">直す</button>` : ''}</div></li>`).join('')}</ul>`).join('') || '<p class="empty">ありません。</p>'}
  <button class="btn" id="newtl">＋ 出来事を足す</button>`;
}
function tlSheet(e) {
  const n = !e; e = e || { id: uid('t-'), y: '', y2: '', t: '', type: 'brand', c: 'doc', user: true };
  sheet(`<h2>${n ? '出来事を足す' : '出来事を直す'}</h2><form class="edit" id="tf">
   <div class="row"><div class="fld grow"><label for="t-y">年</label><input id="t-y" name="y" inputmode="numeric" value="${esc(e.y)}"></div><div class="fld grow"><label for="t-y2">終わりの年（あれば）</label><input id="t-y2" name="y2" inputmode="numeric" value="${esc(e.y2 || '')}"></div></div>
   <div class="fld"><label for="t-t">出来事</label><textarea id="t-t" name="t">${esc(e.t)}</textarea></div>
   <div class="fld"><label for="t-type">種類</label><select id="t-type" name="type">${Object.entries(TL_TYPE).filter(([k]) => k !== 'mine').map(([k, l]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
   <div class="fld"><label>確かさ</label>${certSel('c', e.c)}</div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button>${n ? '' : '<button class="btn danger" type="button" id="tdel">消す</button>'}<button class="btn grow" type="button" id="tx">やめる</button></div></form>`, el => {
    bindCert(el); el.querySelector('#tx').onclick = closeSheet;
    el.querySelector('#tdel')?.addEventListener('click', async () => { await delRec('timeline', e.id); closeSheet(); route(); });
    el.querySelector('#tf').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const y = parseInt(f.get('y'), 10);
      if (!y || !f.get('t').trim()) { toast('年と出来事を書いてください'); return; }
      Object.assign(e, { y, y2: parseInt(f.get('y2'), 10) || null, t: f.get('t').trim(), type: f.get('type'), c: f.get('c') });
      await putRec('timeline', e); closeSheet(); route(); };
  });
}

// ---------- 価格の記録 ----------
let prKind = 'all';
function parseYen(s) { const m = String(s || '').replace(/[,，]/g, '').match(/(\d+)/); return m ? +m[1] : null; }
function itemPrices() {
  return S.items.filter(i => fieldVal(i, 'price') || fieldVal(i, 'paid')).map(i => ({ id: 'ip-' + i.id, fromItem: true, itemId: i.id, name: i.name, kind: i.kind === 'own' ? 'buy' : 'seen', date: fieldVal(i, 'buyDate'), site: fieldVal(i, 'shop'), price: parseYen(fieldVal(i, 'price')), paid: parseYen(fieldVal(i, 'paid')), cur: '円', note: fieldVal(i, 'price') }));
}
function viewPrices() {
  setTitle('価格の記録', 'study');
  const all = [...S.prices, ...itemPrices()].filter(p => prKind === 'all' || p.kind === prKind).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const buys = [...S.prices, ...itemPrices()].filter(p => p.kind === 'buy' && (p.cur || '円') === '円');
  const total = buys.reduce((s, p) => s + (p.paid ?? p.price ?? 0), 0);
  const bySite = {}; buys.forEach(p => { const k = p.site || '不明'; bySite[k] = (bySite[k] || 0) + 1; });
  return `<div class="card"><h3>まとめ（円で記録した購入）</h3><dl class="kv"><dt>件数</dt><dd>${buys.length}件</dd><dt>合計</dt><dd>${yen(total)}円</dd><dt>1件あたり</dt><dd>${buys.length ? yen(Math.round(total / buys.length)) : 0}円</dd><dt>買った場所</dt><dd>${Object.entries(bySite).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join('、') || '—'}</dd></dl>
   <p class="small">「実際に払った額」があればそれを、なければ表示価格を足しています。まとめ買いは1件として数えています。同じ買い物が別のノートにも書かれていると、重ねて数えられることがあります。</p></div>
  <div class="chips">${[['all', 'すべて'], ['buy', '買った'], ['seen', '見かけた']].map(([k, l]) => `<button class="chip" data-pk="${k}" aria-pressed="${prKind === k}">${l}</button>`).join('')}</div>
  <ul class="list">${all.map(p => `<li><a class="li" href="${p.fromItem ? '#item/' + p.itemId : '#price/' + p.id}"><div class="tx"><b>${esc(p.name || '名前なし')}</b><span>${[p.date && fmtDate(p.date), p.site && esc(p.site), p.kind === 'seen' && '見かけた', p.fromItem && '作品の記録から', p.src && '資料' + esc(p.src)].filter(Boolean).join('・')}</span></div><b style="white-space:nowrap">${p.price != null ? (p.cur === '円' || !p.cur ? '¥' + yen(p.price) : yen(p.price) + ' ' + esc(p.cur)) : '—'}${p.paid != null && p.paid !== p.price ? `<br><span class="small">実質¥${yen(p.paid)}</span>` : ''}</b></a></li>`).join('') || '<p class="empty">まだありません。</p>'}</ul>
  <a class="btn primary" href="#price/new/edit">＋ 価格を記録</a>`;
}
function viewPrice(id, c) {
  if (c === 'edit') return viewPriceEdit(id);
  const p = S.prices.find(x => x.id === id); if (!p) return '<p class="empty">見つかりません。</p>';
  setTitle('価格の記録', 'prices'); const it = p.itemId && itemById(p.itemId);
  return `<div class="card"><h2>${esc(p.name)}</h2><dl class="kv"><dt>種類</dt><dd>${p.kind === 'buy' ? '買った' : '見かけた'}</dd><dt>日付</dt><dd>${fmtDate(p.date) || '—'}</dd><dt>場所</dt><dd>${esc(p.site) || '—'}</dd><dt>価格</dt><dd>${p.price != null ? yen(p.price) + ' ' + esc(p.cur || '円') : '—'}</dd>${p.ship != null ? `<dt>送料</dt><dd>${yen(p.ship)} ${esc(p.cur || '円')}</dd>` : ''}${p.paid != null ? `<dt>実際に払った額</dt><dd>${yen(p.paid)}円</dd>` : ''}${it ? `<dt>作品</dt><dd><a href="#item/${it.id}">${esc(it.name)}</a></dd>` : ''}${p.src ? `<dt>出典</dt><dd>${srcLink([p.src])}</dd>` : ''}</dl>${p.note ? `<p style="white-space:pre-wrap">${esc(p.note)}</p>` : ''}</div>
  <div class="row"><a class="btn sm" href="#price/${p.id}/edit">直す</a><button class="btn sm danger" id="delp">削除</button></div>`;
}
function viewPriceEdit(id) {
  const n = id === 'new'; const p = n ? { kind: 'buy', cur: '円', date: today(), itemId: (location.hash.split('?item=')[1] || '') } : S.prices.find(x => x.id === id);
  if (!p) return '<p class="empty">見つかりません。</p>';
  setTitle(n ? '価格を記録' : '価格を直す', n ? 'prices' : 'price/' + id);
  const it = p.itemId && itemById(p.itemId);
  return `<form class="edit" id="pf">
   <div class="fld"><label for="p-n">品名</label><input id="p-n" name="name" value="${esc(p.name || it?.name || '')}"></div>
   <div class="fld"><label for="p-k">種類</label><select id="p-k" name="kind"><option value="buy" ${p.kind === 'buy' ? 'selected' : ''}>買った</option><option value="seen" ${p.kind === 'seen' ? 'selected' : ''}>見かけた</option></select></div>
   <div class="fld"><label for="p-d">日付</label><input id="p-d" name="date" type="date" value="${esc(p.date || '')}"></div>
   <div class="fld"><label for="p-s">場所（メルカリ、Etsy など）</label><input id="p-s" name="site" value="${esc(p.site || '')}"></div>
   <div class="row"><div class="fld grow"><label for="p-p">価格</label><input id="p-p" name="price" inputmode="decimal" value="${p.price ?? ''}"></div><div class="fld" style="width:7em"><label for="p-c">通貨</label><input id="p-c" name="cur" value="${esc(p.cur || '円')}" list="curs"><datalist id="curs"><option value="円"><option value="ドル"><option value="ポンド"><option value="ユーロ"></datalist></div></div>
   <div class="row"><div class="fld grow"><label for="p-sh">送料</label><input id="p-sh" name="ship" inputmode="decimal" value="${p.ship ?? ''}"></div><div class="fld grow"><label for="p-pd">実際に払った額（円）</label><input id="p-pd" name="paid" inputmode="decimal" value="${p.paid ?? ''}"></div></div>
   <div class="fld"><label>作品</label><input type="hidden" name="itemId" value="${esc(p.itemId || '')}"><div class="row"><span class="grow" id="p-it">${it ? esc(it.name) : 'まだ選んでいません'}</span><button class="btn sm" type="button" id="p-pick">作品を選ぶ</button></div></div>
   <div class="fld"><label for="p-no">メモ</label><textarea id="p-no" name="note">${esc(p.note || '')}</textarea></div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button><a class="btn grow" href="#${n ? 'prices' : 'price/' + id}">やめる</a></div></form>`;
}

// ---------- セット ----------
function viewSets() {
  setTitle('セット', 'study');
  return `<p class="lead">同じデザインのブローチ・イヤリング・ネックレスなどを、1つのページに並べます。持っていないものは「探している」として置いておけます。</p>
  <ul class="list">${S.sets.map(s => { const own = (s.members || []).filter(m => m.state === 'own').length; const it = (s.members || []).map(m => m.itemId && itemById(m.itemId)).find(Boolean); return `<li><a class="li" href="#set/${s.id}">${it && mainPhoto(it) ? `<img data-thumb="${mainPhoto(it)}" alt="">` : ''}<div class="tx"><b>${esc(s.name)}</b><span>${(s.members || []).map(m => m.kind).join('・')}（所有 ${own}／${(s.members || []).length}）</span></div><span class="arrow">›</span></a></li>`; }).join('') || '<p class="empty">まだセットはありません。作品のページの「セットに入れる」か、下のボタンから作れます。</p>'}</ul>
  <button class="btn primary" id="newset">＋ セットを作る</button>`;
}
function viewSet(id) {
  const s = S.sets.find(x => x.id === id); if (!s) return '<p class="empty">見つかりません。</p>';
  setTitle(s.name, 'sets');
  return `<div class="card"><h2>${esc(s.name)}</h2>${s.note ? `<p style="white-space:pre-wrap">${esc(s.note)}</p>` : ''}</div>
  <div class="grid">${(s.members || []).map((m, i) => { const it = m.itemId && itemById(m.itemId); const p = it && mainPhoto(it);
    return `<div class="tile" style="cursor:default"><div class="ph">${p ? `<img data-thumb="${p}" alt="">` : `<div class="noimg">${m.state === 'want' ? 'まだ見つかっていない' : '写真なし'}</div>`}<span class="flag ${m.state === 'want' ? 'pend' : ''}">${SET_STATE[m.state]}</span></div>
     <div class="nm"><b>${esc(m.kind)}</b>${it ? `：<a href="#item/${it.id}">${esc(it.name)}</a>` : ''}</div>${m.q ? `<div class="mk">検索語：${esc(m.q)}</div>` : ''}
     <div class="row" style="padding:0 10px">${m.q ? `<a class="btn sm" href="https://gem.app/" target="_blank" rel="noopener" data-gemq="${esc(m.q)}">Gemで探す</a>` : ''}<button class="btn sm" data-mem="${i}">直す</button></div></div>`; }).join('')}</div>
  <button class="btn" id="addmem">＋ 構成品を足す</button>
  <div class="card"><h3>セットと考える根拠</h3><ul class="list">${(s.ev || []).map((e, i) => `<li class="li"><div class="tx">${esc(e.t)} ${certTag(e.c)}</div><button class="chip" data-sev="${i}">消す</button></li>`).join('') || '<p class="empty">まだありません。</p>'}</ul><button class="btn sm" id="addsev">＋ 根拠を足す</button></div>
  <div class="row"><button class="btn sm" id="editset">名前・メモを直す</button><button class="btn sm danger" id="delset">セットを削除</button></div>`;
}
function setSheet(s, afterNew) {
  const n = !s; s = s || { id: uid('s-'), name: '', note: '', members: [], ev: [] };
  sheet(`<h2>${n ? 'セットを作る' : 'セットを直す'}</h2><form class="edit" id="sf"><div class="fld"><label for="s-n">セットの名前</label><input id="s-n" name="name" value="${esc(s.name)}" placeholder="例：紫の房形のセット"></div>
   <div class="fld"><label for="s-no">メモ</label><textarea id="s-no" name="note">${esc(s.note)}</textarea></div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button><button class="btn grow" type="button" id="sx">やめる</button></div></form>`, el => {
    el.querySelector('#sx').onclick = closeSheet;
    el.querySelector('#sf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); if (!f.get('name').trim()) { toast('名前を書いてください'); return; }
      s.name = f.get('name').trim(); s.note = f.get('note').trim(); if (afterNew) afterNew(s); await putRec('sets', s, n ? '作った' : '直した'); closeSheet(); location.hash = 'set/' + s.id; route(); };
  });
}
function memSheet(s, idx, presetItem) {
  const m = idx === undefined ? { kind: 'イヤリング', state: presetItem ? 'own' : 'want', itemId: presetItem || '', q: '' } : s.members[idx];
  sheet(`<h2>${idx === undefined ? '構成品を足す' : '構成品を直す'}</h2><form class="edit" id="mf">
   <div class="fld"><label for="m-k">種類</label><select id="m-k" name="kind">${SET_KIND.map(k => `<option ${m.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
   <div class="fld"><label for="m-s">状態</label><select id="m-s" name="state">${Object.entries(SET_STATE).map(([k, l]) => `<option value="${k}" ${m.state === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
   <div class="fld"><label>作品</label><input type="hidden" name="itemId" value="${esc(m.itemId || '')}"><div class="row"><span class="grow" id="m-it">${m.itemId && itemById(m.itemId) ? esc(itemById(m.itemId).name) : 'なし'}</span><button class="btn sm" type="button" id="m-pick">作品を選ぶ</button></div></div>
   <div class="fld"><label for="m-q">探すときの英語の検索語</label><input id="m-q" name="q" value="${esc(m.q || '')}" placeholder="例：vintage amethyst cluster clip earrings"></div>
   <div class="row"><button class="btn primary grow" type="submit">保存</button>${idx === undefined ? '' : '<button class="btn danger" type="button" id="mdel">外す</button>'}<button class="btn grow" type="button" id="mx">やめる</button></div></form>`, el => {
    el.querySelector('#mx').onclick = closeSheet;
    el.querySelector('#m-pick').onclick = () => { const keep = new FormData(el.querySelector('#mf')); pickItems('構成品の作品を選ぶ', id => { memSheet(s, idx, id); const f = $('#mf'); f.kind.value = keep.get('kind'); f.q.value = keep.get('q'); f.state.value = 'own'; }); };
    if (presetItem) el.querySelector('input[name=itemId]').value = presetItem;
    el.querySelector('#mdel')?.addEventListener('click', async () => { s.members.splice(idx, 1); await putRec('sets', s, `${m.kind}を外した`); closeSheet(); route(); });
    el.querySelector('#mf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const v = { kind: f.get('kind'), state: f.get('state'), itemId: f.get('itemId') || '', q: f.get('q').trim() };
      s.members = s.members || []; if (idx === undefined) s.members.push(v); else s.members[idx] = v;
      await putRec('sets', s, `${v.kind}（${SET_STATE[v.state]}）を${idx === undefined ? '足した' : '直した'}`); closeSheet(); route(); };
  });
}

// ---------- 作品ページに出す「つながり」 ----------
function itemLinks(it) {
  const sets = S.sets.filter(s => (s.members || []).some(m => m.itemId === it.id));
  const qs = S.questions.filter(q => (q.items || []).includes(it.id));
  const pr = S.prices.filter(p => p.itemId === it.id);
  const cl = S.clues.filter(c => clueMatches(c).some(x => x.id === it.id));
  return `<div class="card"><h3>つながり</h3>
   <div><span class="small">セット</span>${sets.length ? `<ul class="list">${sets.map(s => `<li><a class="li" href="#set/${s.id}"><div class="tx"><b>${esc(s.name)}</b></div><span class="arrow">›</span></a></li>`).join('')}</ul>` : '<p class="empty">なし</p>'}<button class="btn sm" id="toset">セットに入れる</button></div>
   <div><span class="small">謎と問い</span>${qs.length ? `<ul class="list">${qs.map(q => `<li><a class="li" href="#question/${q.id}"><div class="tx"><b>${esc(q.q)}</b><span>${QSTAT[q.status || 'open']}</span></div><span class="arrow">›</span></a></li>`).join('')}</ul>` : '<p class="empty">なし</p>'}<button class="btn sm" id="toq">この作品について問いを立てる</button></div>
   <div><span class="small">価格の記録</span>${pr.length ? `<ul class="list">${pr.map(p => `<li><a class="li" href="#price/${p.id}"><div class="tx"><b>${p.price != null ? yen(p.price) + ' ' + esc(p.cur || '円') : '—'}</b><span>${fmtDate(p.date)}・${esc(p.site || '')}・${p.kind === 'buy' ? '買った' : '見かけた'}</span></div></a></li>`).join('')}</ul>` : '<p class="empty">なし（「表示価格」の欄に書いた値段は、価格の記録にも自動で並びます）</p>'}<a class="btn sm" href="#price/new/edit?item=${it.id}">価格を記録</a></div>
   ${cl.length ? `<div><span class="small">当てはまりそうな手がかり</span><ul class="list">${cl.map(c => `<li><a class="li" href="#clue/${c.id}"><div class="tx"><b>${esc(c.t)}</b><span>候補 ${(c.cands || []).map(x => esc(x.to)).join('／')}</span></div><span class="arrow">›</span></a></li>`).join('')}</ul></div>` : ''}</div>`;
}

// ---------- 画面と操作 ----------
const MORE_VIEWS = {
  study: viewStudy, clues: viewClues, clue: viewClue, questions: viewQuestions,
  question: (b, c) => c === 'edit' ? viewQuestionEdit(b) : viewQuestion(b),
  reading: viewReading, read: viewRead, timeline: viewTimeline, prices: viewPrices,
  price: (b, c) => viewPrice(b.split('?')[0], (c || '').split('?')[0]),
  sets: viewSets, set: viewSet, sources: () => viewSources().replace('<p class="lead">', '<p class="lead">').trim(), source: b => viewSource(b)
};
function moreBind(a, b, c, m) {
  const on = (sel, ev, fn) => m.querySelectorAll(sel).forEach(el => el[ev] = fn);
  if (a === 'sources' || a === 'source') setTitle(a === 'sources' ? '資料棚' : $('#title').textContent, a === 'sources' ? 'study' : 'sources');
  // 手がかり
  on('#clq', 'oninput', e => { clueQ = e.target.value; clearTimeout(moreBind.t); moreBind.t = setTimeout(() => { $('#res').innerHTML = cluesRes(); }, 180); });
  on('[data-clc]', 'onclick', e => { clueCat = e.currentTarget.dataset.clc; route(); });
  on('#newclue', 'onclick', () => editClueSheet());
  const clue = a === 'clue' && S.clues.find(x => x.id === b);
  on('#editclue', 'onclick', () => editClueSheet(clue));
  on('#addcand', 'onclick', () => editCandSheet(clue));
  on('[data-cand-edit]', 'onclick', e => editCandSheet(clue, +e.currentTarget.dataset.candEdit));
  on('#delclue', 'onclick', () => confirmSheet('この手がかりを削除しますか？', '削除する', async () => { await delRec('clues', b); location.hash = 'clues'; }, true));
  // 問い
  on('[data-qs]', 'onclick', e => { qStat = e.currentTarget.dataset.qs; route(); });
  on('#newq', 'onclick', () => location.hash = 'question/new/edit');
  const q = a === 'question' && S.questions.find(x => x.id === b);
  on('[data-qset]', 'onclick', async e => { const v = e.currentTarget.dataset.qset; const old = q.status || 'open'; if (v === old) return; q.status = v; await putRec('questions', q, `${QSTAT[old]}→${QSTAT[v]}`); route(); });
  on('[data-evadd]', 'onclick', e => evSheet(q, e.currentTarget.dataset.evadd));
  on('[data-ev]', 'onclick', e => evSheet(q, null, +e.currentTarget.dataset.ev));
  on('#qitem', 'onclick', () => pickItems('関係する作品を選ぶ', async id => { q.items = [...new Set([...(q.items || []), id])]; await putRec('questions', q, `作品「${itemById(id).name}」を結び付けた`); route(); }, q.items || []));
  on('#delq', 'onclick', () => confirmSheet('この問いを削除しますか？', '削除する', async () => { await delRec('questions', b); location.hash = 'questions'; }, true));
  const qf = m.querySelector('#qf');
  if (qf) qf.onsubmit = async e => { e.preventDefault(); const f = new FormData(qf); if (!f.get('q').trim()) { toast('問いを書いてください'); return; }
    const n = b === 'new'; const rec = n ? { id: uid('q-'), status: 'open', ev: [], items: sessionStorage.getItem('qItem') ? [sessionStorage.getItem('qItem')] : [] } : q || S.questions.find(x => x.id === b);
    try { sessionStorage.removeItem('qItem'); } catch (er) { }
    const before = n ? null : JSON.stringify([rec.q, rec.memo, rec.next, rec.conclusion]);
    Object.assign(rec, { q: f.get('q').trim(), memo: f.get('memo').trim(), next: f.get('next').split('\n').map(x => x.trim()).filter(Boolean), conclusion: f.get('conclusion').trim() });
    if (!n && before === JSON.stringify([rec.q, rec.memo, rec.next, rec.conclusion])) { location.hash = 'question/' + rec.id; return; }
    await putRec('questions', rec, n ? '問いを立てた' : '問い・メモ・結論を直した'); location.hash = 'question/' + rec.id; };
  // 年表
  on('[data-tt]', 'onclick', e => { tlType = e.currentTarget.dataset.tt; route(); });
  on('#tlmine', 'onchange', e => { tlMine = e.target.checked; route(); });
  on('[data-tg]', 'onclick', e => { e.preventDefault(); document.getElementById('tg-' + e.currentTarget.dataset.tg)?.scrollIntoView(); });
  on('#newtl', 'onclick', () => tlSheet());
  on('[data-tled]', 'onclick', e => tlSheet(S.timeline.find(x => x.id === e.currentTarget.dataset.tled)));
  // 価格
  on('[data-pk]', 'onclick', e => { prKind = e.currentTarget.dataset.pk; route(); });
  on('#delp', 'onclick', () => confirmSheet('この価格の記録を削除しますか？', '削除する', async () => { await delRec('prices', b); location.hash = 'prices'; }, true));
  const pf = m.querySelector('#pf');
  if (pf) {
    pf.querySelector('#p-pick').onclick = () => pickItems('作品を選ぶ', id => { pf.itemId.value = id; pf.querySelector('#p-it').textContent = itemById(id).name; if (!pf.name.value) pf.name.value = itemById(id).name; });
    pf.onsubmit = async e => { e.preventDefault(); const f = new FormData(pf); const id = b.split('?')[0]; const n = id === 'new';
      const num = k => { const v = String(f.get(k) || '').replace(/[,，¥$£€\s]/g, ''); return v === '' ? null : Number(v); };
      if (!f.get('name').trim() && !f.get('itemId')) { toast('品名を書くか、作品を選んでください'); return; }
      const rec = n ? { id: uid('pr-') } : S.prices.find(x => x.id === id);
      Object.assign(rec, { name: f.get('name').trim() || itemById(f.get('itemId'))?.name, kind: f.get('kind'), date: f.get('date'), site: f.get('site').trim(), price: num('price'), cur: f.get('cur').trim() || '円', ship: num('ship'), paid: num('paid'), itemId: f.get('itemId') || '', note: f.get('note').trim() });
      await putRec('prices', rec); toast('記録しました'); location.hash = 'price/' + rec.id; };
  }
  // セット
  on('#newset', 'onclick', () => setSheet());
  const st = a === 'set' && S.sets.find(x => x.id === b);
  on('#editset', 'onclick', () => setSheet(st));
  on('#addmem', 'onclick', () => memSheet(st));
  on('[data-mem]', 'onclick', e => memSheet(st, +e.currentTarget.dataset.mem));
  on('[data-gemq]', 'onclick', e => { const qq = e.currentTarget.dataset.gemq; try { navigator.clipboard.writeText(qq).then(() => toast('検索語をコピーしました'), () => toast('検索語：' + qq, 6000)); } catch (er) { toast('検索語：' + qq, 6000); } });
  on('#addsev', 'onclick', () => sheet(`<h2>セットと考える根拠</h2><form class="edit" id="svf"><div class="fld"><label for="sv-t">内容</label><textarea id="sv-t" name="t" placeholder="例：石の色と形、金具が同じ"></textarea></div><div class="fld"><label>確かさ</label>${certSel('c', 'guess')}</div><button class="btn primary" type="submit">保存</button></form>`, el => {
    bindCert(el); el.querySelector('#svf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); if (!f.get('t').trim()) return; st.ev = st.ev || []; st.ev.push({ t: f.get('t').trim(), c: f.get('c') }); await putRec('sets', st, '根拠を足した'); closeSheet(); route(); };
  }));
  on('[data-sev]', 'onclick', async e => { st.ev.splice(+e.currentTarget.dataset.sev, 1); await putRec('sets', st, '根拠を消した'); route(); });
  on('#delset', 'onclick', () => confirmSheet('このセットを削除しますか？作品は消えません。', '削除する', async () => { await delRec('sets', b); location.hash = 'sets'; }, true));
  // 作品ページの「つながり」
  if (a === 'item' && !c) {
    on('#toset', 'onclick', () => {
      const html = `<h2>どのセットに入れますか</h2><ul class="list">${S.sets.map(s => `<li><button class="li" style="width:100%" data-ts="${s.id}"><div class="tx"><b>${esc(s.name)}</b></div></button></li>`).join('')}</ul><button class="btn primary" id="tsnew">新しいセットを作って入れる</button><button class="btn" id="tsx">やめる</button>`;
      sheet(html, el => {
        el.querySelector('#tsx').onclick = closeSheet;
        el.querySelector('#tsnew').onclick = () => setSheet(null, s => { s.members = [{ kind: 'ブローチ', state: 'own', itemId: b, q: '' }]; });
        el.querySelectorAll('[data-ts]').forEach(x => x.onclick = () => memSheet(S.sets.find(s => s.id === x.dataset.ts), undefined, b));
      });
    });
    on('#toq', 'onclick', () => { try { sessionStorage.setItem('qItem', b); } catch (e) { } location.hash = 'question/new/edit'; });
  }
  fillThumbs(m);
}
