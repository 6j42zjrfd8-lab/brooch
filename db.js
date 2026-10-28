// iPhoneの中（IndexedDB）にデータと写真を保存する。
const DB = (() => {
  const NAME = 'brooch-research';
  const STORES = ['items', 'photos', 'blobs', 'sources', 'brands', 'materials', 'unconfirmed', 'kv'];
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of STORES) {
          if (db.objectStoreNames.contains(s)) continue;
          if (s === 'brands' || s === 'materials') db.createObjectStore(s, { keyPath: 'n' });
          else if (s === 'sources') db.createObjectStore(s, { keyPath: 'key' });
          else if (s === 'kv') db.createObjectStore(s);
          else db.createObjectStore(s, { keyPath: 'id' });
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function tx(store, mode = 'readonly') {
    const db = await open();
    return db.transaction(store, mode).objectStore(store);
  }
  async function all(store) { return req((await tx(store)).getAll()); }
  async function get(store, key) { return req((await tx(store)).get(key)); }
  async function put(store, val, key) {
    const s = await tx(store, 'readwrite');
    return req(key === undefined ? s.put(val) : s.put(val, key));
  }
  async function del(store, key) { return req((await tx(store, 'readwrite')).delete(key)); }
  async function putMany(store, vals) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const v of vals) s.put(v);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  async function clearAll() {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORES, 'readwrite');
      for (const s of STORES) t.objectStore(s).clear();
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  return { all, get, put, del, putMany, clearAll };
})();
