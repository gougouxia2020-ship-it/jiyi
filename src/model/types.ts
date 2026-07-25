// 念念 · 陈列室 —— 核心数据模型（B1 地基）
//
// 关系：Scene 与 Item 多对多，经 Placement 关联。
// 一件 Item 可被摆进多个 Scene（每次摆放是一条 Placement），
// 同一 Scene 里也可摆多件 Item。
// 「故事」挂在 Item 本身（跨场景同步），而非挂在某次 Placement 上；
// 位置/大小/角度/层级（x/y/scale/rotation/z）才随「这次摆放」走。

/** 场景 = 一个画布（房间空间），绑定一张预置背景图。背景不可重复，上限 3。 */
export interface Scene {
  id: string;
  name: string;
  /** 关联内置背景素材的 id（见 assets/manifest 的 BACKGROUNDS） */
  backgroundId: string;
}

/**
 * 物件 = 想陈列的旧物，带一段用户写的故事（故事挂物件本身，跨场景同步）。
 *
 * U1（双源目录）：物件目录不再是编译期焊死的 14 件，而是**双源**——
 *  - 内置项（source==='builtin'）：由 assets/manifest 的 ITEMS 派生，宽高比等由构建脚本烘焙。
 *  - 用户项（source==='user'）：将来（U2/U3）用户上传，宽高比在上传时测得。
 * 因此 Item 自带来源标记 source、运行时宽高比 aspectRatio，以及「原图 / 展示图」两个位——
 * 本期两者指向同一张图；将来接抠图后，展示图是抠好的透明 PNG、原图仍是朋友拍的那张
 * （故事弹窗展示的正是原图）。
 * 图片二进制的实际存储位置（IndexedDB）留给 U1-S2；本期 imageSrc 仍指向现有存法（打包资源 URL /
 * data URL）过渡，与 displayImageSrc 同源。
 */
export interface Item {
  id: string;
  name: string;
  /** 来源标记：内置清单（'builtin'）或用户上传（'user'）。双源目录的分流依据（U1）。 */
  source: 'builtin' | 'user';
  /**
   * 运行时宽高比 = 实体宽 / 高。内置项对齐 ItemAsset.aspectRatio（构建脚本烘焙），
   * 用户项在上传时测得（U2/U3）；渲染/选中框按此比例摆放。
   */
  aspectRatio: number;
  /** 「原图」——朋友拍的那张 / 内置原始素材；故事弹窗展示的即此张（本期与展示图同源）。 */
  originalImageSrc: string;
  /** 「展示图」——入场景渲染用的图；本期与原图同源，将来接抠图后为抠好的透明 PNG。 */
  displayImageSrc: string;
  /** 透明抠图的图片地址（构建后为打包资源 URL）。过渡字段：本期仍指向现有存法、与 displayImageSrc 同源（U1-S2 起图迁 IndexedDB）。 */
  imageSrc: string;
  /**
   * 图片二进制在 IndexedDB 里的引用键（U1-S2·存储换血）。用户上传件的照片二进制（Blob）存 IndexedDB，
   * 状态树（LocalStorage）只保留这个引用 id ＋ 元信息（aspectRatio / name 等），绝不存二进制 / base64：
   * saveState 序列化前把内联图片（data:/blob:）搬进 IndexedDB 并在此登记 ref、把图片位清空。
   * 内置件走打包资源 URL（本就是引用、不含二进制），无此字段。渲染层据 ref 从 IndexedDB 取图属 U2/U3。
   */
  imageRef?: string;
  /** 用户写的故事；初始为空串 */
  story: string;
}

/**
 * 摆放 = 某个 Item 在某个 Scene 中的一次落位（多对多的连接实体）。
 *
 * N2（schema v3）：坐标系锚定「场景图坐标系」——即 contain 居中后场景图占据的那块矩形（imgRect），
 * 而非整块可视区。x/y 存物件**中心**在图内的百分比、w 存物件**宽度**占图宽的百分比：
 *   x = 中心水平位置 / 图宽 × 100，y = 中心垂直位置 / 图高 × 100，w = 物件宽 / 图宽 × 100。
 * 由此窗口任意缩放时，物件位置与大小都随场景图一起重排——钉在房间同一相对位置与相对大小。
 * 常规摆放落在 0–100；允许坐标出界（<0 或 >100）把物件摆进两侧的模糊补边区。
 * 物件高度由 w 与该物件素材的真实宽高比（ItemAsset.aspectRatio）导出，不单独存储。
 *
 * 变更史：v1 像素位移 → v2 可视区百分比 + scale 倍率 → v3 场景图坐标系百分比 x/y/w（本次）。
 * 旧版数据不迁移、直接作废重置（见 storage/persistence）。
 */
export interface Placement {
  id: string;
  sceneId: string;
  itemId: string;
  /** 物件中心的水平位置：场景图坐标系内百分比（相对图宽；0=左缘,100=右缘；可出界进补边区） */
  x: number;
  /** 物件中心的垂直位置：场景图坐标系内百分比（相对图高；0=上缘,100=下缘；可出界进补边区） */
  y: number;
  /** 物件宽度：占场景图宽的百分比（随图缩放，钉在房间同一相对大小；高度由素材宽高比导出） */
  w: number;
  /** 旋转角度（deg） */
  rotation: number;
  /** 层级（同场景内的堆叠顺序，越大越靠上） */
  z: number;
}

/** 编辑 / 游客 双模式。 */
export type Mode = 'edit' | 'guest';

/**
 * 全量应用状态 —— LocalStorage 全量读写的单一载体（非增量）。
 * schemaVersion 用于持久化格式版本管理与后续迁移。
 */
export interface GalleryState {
  schemaVersion: number;
  /** 陈列室名（品牌章）——报头就地编辑，随状态持久化（N3·管理与命名）。 */
  galleryName: string;
  scenes: Scene[];
  items: Item[];
  placements: Placement[];
  /** 当前激活的场景 id；无场景时为 null */
  activeSceneId: string | null;
  mode: Mode;
}
