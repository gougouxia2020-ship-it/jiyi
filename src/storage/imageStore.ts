// 念念 · 陈列室 —— 图片二进制存取模块（U1-S2·存储换血）
//
// 职责：把照片二进制（Blob）存进 IndexedDB，键为图片引用 id（imageRef）。状态树（LocalStorage）
//  只保留这个引用 id ＋ 宽高比等元信息，二进制 / base64 一律不进 LocalStorage —— 由
//  storage/persistence 的 saveState 在序列化前把内联图片（data:/blob:）搬到这里、只留引用。
//
// 契约：
//  - 纯前端、无后端；IndexedDB 不可用（SSR / 老浏览器 / 部分隐私模式）时优雅降级：
//    isImageStoreAvailable() 返回 false；写（putImage）以 reject 冒泡让上层感知，读（getImage/hasImage）
//    返回空、不抛，避免读侧连累渲染。
//  - 所有写 / 读失败一律以 reject 冒泡，绝不静默吞 —— 配合 U1-S2「终结静默失败」。

const DB_NAME = 'memories.images';
const DB_VERSION = 1;
const STORE = 'images';

/** IndexedDB 是否可用（SSR / 无 indexedDB 环境下为 false）。 */
export function isImageStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

// 单例连接（同一会话内复用）；打开失败即清空缓存、允许下次重试。
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isImageStoreAvailable()) {
    return Promise.reject(new Error('IndexedDB 不可用'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // 显式 key（外部传入 imageRef），不用 keyPath / autoIncrement。
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('打开 IndexedDB 失败'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** 把一次对象仓事务包成 Promise（成功 resolve 请求结果，失败 / 中止 reject）。 */
function runTx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'));
      }),
  );
}

/** 存入 / 覆盖一张图片二进制。写入失败（磁盘满 / 隐私模式等）以 reject 冒泡。 */
export function putImage(id: string, blob: Blob): Promise<void> {
  return runTx('readwrite', (store) => store.put(blob, id)).then(() => undefined);
}

/** 读回一张图片二进制；无则 undefined。IndexedDB 不可用时返回 undefined（不抛，读侧不连累渲染）。 */
export function getImage(id: string): Promise<Blob | undefined> {
  if (!isImageStoreAvailable()) return Promise.resolve(undefined);
  return runTx<Blob | undefined>(
    'readonly',
    (store) => store.get(id) as IDBRequest<Blob | undefined>,
  );
}

/** 是否已存该图片（供 saveState 幂等去重，避免每次全量落盘都重复写同一张二进制）。 */
export function hasImage(id: string): Promise<boolean> {
  if (!isImageStoreAvailable()) return Promise.resolve(false);
  return runTx<number>('readonly', (store) => store.count(id)).then((n) => n > 0);
}

/** 删除一张图片二进制。 */
export function deleteImage(id: string): Promise<void> {
  if (!isImageStoreAvailable()) return Promise.resolve();
  return runTx('readwrite', (store) => store.delete(id)).then(() => undefined);
}

/**
 * 读回图片并生成一个会话内 object URL（供渲染层 hydrate 用户上传件；无则 undefined）。
 * 调用方在不再需要时负责 URL.revokeObjectURL 释放。渲染链接入属 U2/U3，本期先备好口子。
 */
export function getImageObjectURL(id: string): Promise<string | undefined> {
  return getImage(id).then((blob) => (blob ? URL.createObjectURL(blob) : undefined));
}

/**
 * 把 data: URL（base64 或百分号编码）解成 Blob —— 供把内联图片搬进 IndexedDB。
 * 非 data: URL 抛错（交由上层决定是否继续）。
 */
export function dataURLToBlob(dataURL: string): Blob {
  const comma = dataURL.indexOf(',');
  if (!dataURL.startsWith('data:') || comma < 0) {
    throw new Error('不是合法的 data: URL');
  }
  const header = dataURL.slice(5, comma); // 形如 "image/png;base64"
  const isBase64 = /;base64/i.test(header);
  const mime = header.split(';')[0] || 'application/octet-stream';
  const data = dataURL.slice(comma + 1);
  if (isBase64) {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}
