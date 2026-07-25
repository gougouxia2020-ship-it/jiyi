// 念念 · 陈列室 —— 持久化（B1 地基；U1-S2 存储换血）
//
// 契约：
//  - 带 schema 版本号（SCHEMA_VERSION）。
//  - 分层存储（U1-S2）：状态树（引用 + 元信息）走 LocalStorage 全量读写；照片二进制（Blob）走
//    IndexedDB（storage/imageStore）。LocalStorage 里的 Item 图片位只存引用 id（imageRef），
//    绝不存二进制 / base64 —— saveState 序列化前把内联图片（data:/blob:）搬进 IndexedDB、只留 ref。
//  - 全量读写、非增量：saveState 每次序列化并写入整棵状态树；loadState 每次读回整棵状态树。
//  - schema 版本不匹配或数据损坏时，回退到初始状态（不做迁移，直接作废重置）。
//  - 终结静默失败（U1-S2）：写入失败（LocalStorage 配额超限 / 隐私模式、IndexedDB 写失败）一律
//    以 StorageError 冒泡，调用方（App）据此弹明确提示——不再无声吞掉数据。
//
// N2（schema v3）：Placement 坐标系锚定到「场景图矩形（contain 后）」——x/y 存中心百分比、
//  w 存宽度占图宽百分比（取代 v2 的可视区百分比 + scale 倍率）。按 idea 定调——旧摆放数据作废、
//  不做迁移（清空重摆），故不写折算逻辑：loadState 遇到 schemaVersion 不等于 SCHEMA_VERSION 的
//  旧数据，直接返回初始空状态（不崩溃、清空重摆），Item.story 字段结构保持不变（仍挂 Item 本身，
//  仅在同版本数据内 reconcile 保留）。

import type { GalleryState, Item } from '../model/types';
import { ITEMS } from '../assets/manifest';
import { dataURLToBlob, hasImage, putImage } from './imageStore';

/**
 * 持久化 schema 版本号。数据结构变更时递增。
 * v1 → v2：Placement.x/y 从像素改为可视区百分比。
 * v2 → v3：坐标系改为场景图矩形（contain 后）——x/y 存中心百分比、以 w 取代 scale。
 * v3 → v4（U1-S2·存储换血）：照片二进制迁 IndexedDB，LocalStorage 里 Item 图片位改存引用（imageRef）
 *   不再存图；旧数据（v1–v3）一律不迁移、作废重置（清空重摆）。
 * 旧版数据一律不迁移、作废重置（清空重摆，故事结构保留）。
 */
export const SCHEMA_VERSION = 4;

/** 写入失败的类型：LocalStorage（配额超限 / 隐私模式）或 IndexedDB（图片二进制写失败）。 */
export type StorageErrorKind = 'local-storage' | 'indexed-db';

/**
 * 存储写入失败（U1-S2）。saveState 不再静默吞错——底层写入抛错时包成本类型 reject 冒泡，
 * message 即面向用户的明确提示，调用方（App）直接展示，终结「提示成功、刷新就没」的静默丢失。
 */
export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  constructor(kind: StorageErrorKind, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'StorageError';
    this.kind = kind;
  }
}

/** LocalStorage 键名。 */
export const STORAGE_KEY = 'memories.gallery';

/** 陈列室名（品牌章）默认值——首次进入或旧数据作废重置时的初始名。 */
export const DEFAULT_GALLERY_NAME = '念念 · 陈列室';

/**
 * 由内置素材清单派生初始 Item 列表（U1 双源目录的「内置源」）。
 * 每件标记 source='builtin'、宽高比对齐 ItemAsset.aspectRatio（构建脚本烘焙）；
 * 「原图 / 展示图」两个位本期与 imageSrc 同源（打包资源 URL），故事初始为空串（故事挂物件本身）。
 */
export function createInitialItems(): Item[] {
  return ITEMS.map((asset) => ({
    id: asset.id,
    name: asset.name,
    source: 'builtin' as const,
    aspectRatio: asset.aspectRatio,
    originalImageSrc: asset.imageSrc,
    displayImageSrc: asset.imageSrc,
    imageSrc: asset.imageSrc,
    story: '',
  }));
}

/** 全新的初始状态：无场景、无摆放，物件目录已就位，编辑模式。 */
export function createInitialState(): GalleryState {
  return {
    schemaVersion: SCHEMA_VERSION,
    galleryName: DEFAULT_GALLERY_NAME,
    scenes: [],
    items: createInitialItems(),
    placements: [],
    activeSceneId: null,
    mode: 'edit',
  };
}

/**
 * 全量读取。读不到 / 解析失败 / schema 版本不匹配 → 返回初始状态。
 * 读回后始终把 items 的 imageSrc 与最新素材清单对齐（构建后资源 URL 带哈希会变），
 * story 等用户数据以持久化内容为准。
 */
export function loadState(): GalleryState {
  if (typeof localStorage === 'undefined') return createInitialState();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return createInitialState();
  }
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw) as Partial<GalleryState> | null;
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      // 版本不匹配（含 v1 像素坐标、v2 可视区百分比+scale 的旧数据）：不迁移、直接作废重置为
      // 初始空状态（清空重摆，不崩溃）。
      return createInitialState();
    }
    const base = createInitialState();
    const merged: GalleryState = {
      schemaVersion: SCHEMA_VERSION,
      // 陈列室名以持久化为准（非空），缺失/损坏回退默认。
      galleryName:
        typeof parsed.galleryName === 'string' && parsed.galleryName.trim()
          ? parsed.galleryName
          : base.galleryName,
      scenes: Array.isArray(parsed.scenes) ? parsed.scenes : base.scenes,
      items: reconcileItems(parsed.items, base.items),
      placements: Array.isArray(parsed.placements) ? parsed.placements : base.placements,
      activeSceneId:
        typeof parsed.activeSceneId === 'string' ? parsed.activeSceneId : base.activeSceneId,
      mode: parsed.mode === 'guest' ? 'guest' : 'edit',
    };
    return merged;
  } catch {
    return createInitialState();
  }
}

/** Item 上三个图片位——序列化前逐一检查是否为内联二进制（data:/blob:）。 */
const IMAGE_FIELDS = ['imageSrc', 'originalImageSrc', 'displayImageSrc'] as const;

/** 待搬进 IndexedDB 的一张图片二进制（键 = imageRef）。 */
interface PendingImage {
  id: string;
  blob: Blob;
}

/** 内联图片判定：data:（base64/纯文本内联）或 blob:（会话 object URL）——都不该落进 LocalStorage。 */
function isInlineImage(src: unknown): src is string {
  return typeof src === 'string' && (src.startsWith('data:') || src.startsWith('blob:'));
}

/**
 * 引用化（U1-S2 核心）：把状态树里的内联图片从 LocalStorage 载荷剥离——
 *  - 二进制交给 IndexedDB（收集进 images，键为 imageRef；同一用户件三个图位通常同源，搬一份即够）；
 *  - LocalStorage 载荷里对应 Item 的图片位一律清空（''），只留引用 ref ＋ 元信息。
 * 内置件走打包资源 URL（本就是引用、不含二进制）——原样保留、不受影响。纯函数、无副作用。
 */
function splitImages(state: GalleryState): { payload: GalleryState; images: PendingImage[] } {
  const images: PendingImage[] = [];
  const items = state.items.map((item): Item => {
    if (!IMAGE_FIELDS.some((f) => isInlineImage(item[f]))) return item;
    // 该件带内联图片（用户上传件）：定引用键（沿用已有 imageRef，否则由 id 派生、稳定幂等）。
    const ref = item.imageRef ?? `img-${item.id}`;
    // 找一张可解码的 data: URL 搬进 IndexedDB（blob: 无法同步解码：其二进制应已在上传时入库，只剥不搬）。
    const dataURL = IMAGE_FIELDS.map((f) => item[f]).find(
      (src): src is string => typeof src === 'string' && src.startsWith('data:'),
    );
    if (dataURL) {
      try {
        images.push({ id: ref, blob: dataURLToBlob(dataURL) });
      } catch {
        // 解码失败：不搬二进制，但仍把内联串从 LocalStorage 剥掉（下方清空），确保 base64 不落 LS。
      }
    }
    const next: Item = { ...item, imageRef: ref };
    for (const f of IMAGE_FIELDS) {
      if (isInlineImage(next[f])) next[f] = '';
    }
    return next;
  });
  return { payload: { ...state, items, schemaVersion: SCHEMA_VERSION }, images };
}

/** 把收集到的图片二进制搬进 IndexedDB（幂等去重）。写失败以 StorageError 冒泡（不静默）。 */
async function putImages(images: PendingImage[]): Promise<void> {
  for (const img of images) {
    let exists = false;
    try {
      exists = await hasImage(img.id);
    } catch {
      exists = false; // 查询失败不阻断，走到写入再判成败。
    }
    if (exists) continue;
    try {
      await putImage(img.id, img.blob);
    } catch (err) {
      throw new StorageError('indexed-db', '图片没能存入本地数据库，改动可能未保存，请重试。', err);
    }
  }
}

/** 引用树写 LocalStorage；配额超限 / 隐私模式等抛错 → 包成 StorageError 冒泡（终结静默失败）。 */
function writeLocalStorage(payload: GalleryState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    throw new StorageError(
      'local-storage',
      '存储空间不足或浏览器处于隐私模式，改动没能保存，请清理空间或退出隐私模式后重试。',
      err,
    );
  }
}

/**
 * 全量写入（U1-S2 存储换血）：把整棵状态树落盘（非增量）——照片二进制搬进 IndexedDB，
 * 引用树写 LocalStorage。任一层写入失败一律以 StorageError 冒泡（不静默吞），调用方据此弹提示。
 *
 * 时序：内置件全走打包 URL（无内联二进制）时无需碰 IndexedDB，同步写 LocalStorage —— 与旧版时序一致、
 *  刷新还原类用例零回归；仅当存在用户上传件（内联图片）时才先把二进制搬进 IndexedDB、再写引用树。
 */
export async function saveState(state: GalleryState): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const { payload, images } = splitImages(state);
  if (images.length === 0) {
    writeLocalStorage(payload);
    return;
  }
  await putImages(images);
  writeLocalStorage(payload);
}

/** 清空持久化（重置到初始）。 */
export function clearState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/**
 * 双源目录 reconcile（U1）——按来源分两路，用户物件不再被丢弃：
 *
 *  1) 内置项：以内置清单（initial，对齐 manifest 的 ITEMS）为基准逐件对齐——
 *     source/aspectRatio/originalImageSrc/displayImageSrc/imageSrc 以清单为准
 *     （构建后哈希 URL 可能变化），name/story 以持久化内容为准（用户数据；name 缺失/空白回退
 *     清单默认名）。由此 14 件内置物件恒在（缺失从清单补齐），重命名（N3）与故事刷新后不丢。
 *
 *  2) 用户项：id 不在内置清单里的持久化物件（即用户上传的，source==='user'）**原样保留**，
 *     不再被丢弃。这修掉了旧版拿内置清单当基准 `initial.map(...)` 遍历、把任何不在清单上的
 *     用户物件读回时直接蒸发的 bug。
 *
 * 顺序：内置 14 件在前（对齐清单顺序、稳定），用户项按持久化顺序接在其后。
 */
function reconcileItems(persisted: Item[] | undefined, initial: Item[]): Item[] {
  if (!Array.isArray(persisted)) return initial;
  const byId = new Map(persisted.map((i) => [i.id, i]));
  const builtinIds = new Set(initial.map((i) => i.id));

  // 1) 内置项：对齐清单 + 保留用户写入的 name/story。
  const builtins = initial.map((base) => {
    const saved = byId.get(base.id);
    if (!saved) return base;
    return {
      ...base,
      name: typeof saved.name === 'string' && saved.name.trim() ? saved.name : base.name,
      story: typeof saved.story === 'string' ? saved.story : '',
    };
  });

  // 2) 用户项：id 不在内置清单里的持久化物件原样保留（不丢弃）。
  const users = persisted.filter(
    (i): i is Item => !!i && typeof i.id === 'string' && !builtinIds.has(i.id),
  );

  return [...builtins, ...users];
}
