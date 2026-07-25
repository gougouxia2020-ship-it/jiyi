// 念念 · 陈列室 —— 应用外壳状态（M1-S2 起，M2-S1 补拖动/移除）
//
// 纯函数 reducer + 派生选择器，架在 M1-S1 的数据模型（model/types）与
// 素材清单（assets/manifest）之上。App 用 useReducer 持有 GalleryState，
// 每次变更经 storage/persistence 的 saveState 全量落盘（非增量）。
//
// 约束（对齐验收硬指标）：
//  - 场景绑定内置背景，背景不可重复；场景上限 = 背景数量（MAX_SCENES = 3）。
//  - 用满 3 个背景后不能再建场景（canAddScene → false，UI 置灰 + “素材已用完”）。
//  - 摆放（placement）落在当前场景，随状态树持久化，刷新后完整还原。
//  - M2-S1：拖动改位（move-placement）与移除（remove-placement）只在编辑模式生效，
//    与 place-item 同款守卫（游客模式只读，为 M3 的双模式只读留口子）。
//  - M2-S2 / N2：缩放（resize-placement，改 w）、旋转（rotate-placement）同款守卫，只改各自字段；
//    place-item 新增可选 x/y —— 抽屉「拖入画布」传落点坐标，「点选放入」不传、走默认网格位。
//  - M3-S1：物件故事（set-item-story）——把故事写在 Item 本身（不写 Placement），同款编辑模式守卫。
//    因故事挂 Item，同一 Item 在多个场景的多条 Placement 天然共享同一段故事：一处改、处处同步；
//    绝不把 story 存成某条 Placement 的副本（那会造成跨场景新旧不一致，违反验收硬指标）。

import type { GalleryState, Item, Mode, Placement, Scene } from '../model/types';
import { BACKGROUNDS, MAX_SCENES, type BackgroundAsset } from '../assets/manifest';

export type GalleryAction =
  | { type: 'create-scene'; backgroundId: string }
  | { type: 'select-scene'; sceneId: string }
  | { type: 'rename-scene'; sceneId: string; name: string }
  | { type: 'delete-scene'; sceneId: string }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'place-item'; itemId: string; x?: number; y?: number }
  | { type: 'move-placement'; placementId: string; x: number; y: number }
  | { type: 'resize-placement'; placementId: string; w: number }
  | { type: 'rotate-placement'; placementId: string; rotation: number }
  | { type: 'remove-placement'; placementId: string }
  | { type: 'set-item-story'; itemId: string; story: string }
  | { type: 'set-item-name'; itemId: string; name: string }
  | { type: 'add-item'; name: string; aspectRatio: number; imageSrc: string }
  | { type: 'delete-item'; itemId: string }
  | { type: 'hydrate-item-image'; itemId: string; imageSrc: string }
  | { type: 'set-gallery-name'; name: string };

/** 新摆放的默认宽度：占场景图宽的百分比（N2·schema v3；约合中等物件，可再缩放）。 */
export const DEFAULT_ITEM_W = 12;

/** 上传物件上限（U3-S2·配额）：用户上传件最多 50 件；达上限后上传入口前置阻止、reducer 拒绝入库。 */
export const MAX_UPLOADS = 50;

/** 已上传的用户件数量（source==='user' 的 Item 计数）——dock「已传 N/50」与配额判定的单一数据源。 */
export function userItemCount(state: GalleryState): number {
  return state.items.reduce((n, i) => (i.source === 'user' ? n + 1 : n), 0);
}

/** 还能不能再上传：已传数量未达上限（MAX_UPLOADS）。UI 与 reducer 共用同一判定。 */
export function canUpload(state: GalleryState): boolean {
  return userItemCount(state) < MAX_UPLOADS;
}

/** 单调递增计数 + 时间戳 + 随机后缀，保证同一会话内 id 唯一。 */
let idSeq = 0;
function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}-${Math.random().toString(36).slice(2, 7)}`;
}

// —— 派生选择器 ——

/** 尚未被任何场景占用的背景（背景不可重复的可视化数据源）。 */
export function availableBackgrounds(state: GalleryState): BackgroundAsset[] {
  const used = new Set(state.scenes.map((s) => s.backgroundId));
  return BACKGROUNDS.filter((b) => !used.has(b.id));
}

/** 还能不能再建场景：仍有未用背景，且未达上限。 */
export function canAddScene(state: GalleryState): boolean {
  return state.scenes.length < MAX_SCENES && availableBackgrounds(state).length > 0;
}

/** 当前激活的场景对象（无则 undefined）。 */
export function activeScene(state: GalleryState): Scene | undefined {
  return state.scenes.find((s) => s.id === state.activeSceneId);
}

/** 某场景内的摆放，按层级 z 升序（渲染顺序）。 */
export function placementsOfScene(state: GalleryState, sceneId: string): Placement[] {
  return state.placements.filter((p) => p.sceneId === sceneId).sort((a, b) => a.z - b.z);
}

// —— reducer ——

export function galleryReducer(state: GalleryState, action: GalleryAction): GalleryState {
  switch (action.type) {
    case 'create-scene': {
      // 守卫：达上限、背景已被占用、或背景不存在 → 拒绝（背景不可重复、上限 3）。
      if (state.scenes.length >= MAX_SCENES) return state;
      const bg = BACKGROUNDS.find((b) => b.id === action.backgroundId);
      if (!bg) return state;
      if (state.scenes.some((s) => s.backgroundId === bg.id)) return state;

      const scene: Scene = { id: newId('scene'), name: bg.name, backgroundId: bg.id };
      return { ...state, scenes: [...state.scenes, scene], activeSceneId: scene.id };
    }

    case 'select-scene': {
      if (!state.scenes.some((s) => s.id === action.sceneId)) return state;
      if (state.activeSceneId === action.sceneId) return state;
      return { ...state, activeSceneId: action.sceneId };
    }

    case 'rename-scene': {
      // 场景就地重命名（chip 点进去改）：只改 name，其余字段不动。空白名忽略（保底不产生空 chip）。
      const name = action.name.trim();
      if (!name) return state;
      const target = state.scenes.find((s) => s.id === action.sceneId);
      if (!target) return state;
      if (target.name === name) return state; // 无变化 → 免去一次全量落盘
      return {
        ...state,
        scenes: state.scenes.map((s) => (s.id === action.sceneId ? { ...s, name } : s)),
      };
    }

    case 'delete-scene': {
      // 场景删除（chip 次级入口）：移除该场景 + 其名下所有摆放。因 availableBackgrounds/canAddScene
      //  都由 scenes 派生，删除后该背景即刻回到可选池（配额释放、可再建）。删的是当前激活场景时，
      //  把激活位交给剩余场景的第一个（无剩余则 null）。
      const target = state.scenes.find((s) => s.id === action.sceneId);
      if (!target) return state;
      const scenes = state.scenes.filter((s) => s.id !== action.sceneId);
      const placements = state.placements.filter((p) => p.sceneId !== action.sceneId);
      const activeSceneId =
        state.activeSceneId === action.sceneId
          ? scenes.length > 0
            ? scenes[0].id
            : null
          : state.activeSceneId;
      return { ...state, scenes, placements, activeSceneId };
    }

    case 'set-mode': {
      if (state.mode === action.mode) return state;
      return { ...state, mode: action.mode };
    }

    case 'place-item': {
      // 只在编辑模式、且有激活场景时把物件放入当前画布。
      if (state.mode !== 'edit') return state;
      const sceneId = state.activeSceneId;
      if (!sceneId) return state;
      if (!state.items.some((i) => i.id === action.itemId)) return state;

      const n = state.placements.filter((p) => p.sceneId === sceneId).length;
      const rotations = [-5, 4, -3, 6, -6, 3];
      // N2（schema v3）：x/y 存物件**中心**在场景图坐标系内的百分比、w 存宽度占图宽的百分比。
      //  - 抽屉拖入：带落点坐标（x/y，已由上层换算成图内中心百分比）→ 落在指针放手处（允许出界进补边区）；
      //  - 点选放入：不带 → 走默认网格位（以中心百分比铺开，四列一行、留出四周呼吸区）。
      const dropped = typeof action.x === 'number' && typeof action.y === 'number';
      const placement: Placement = {
        id: newId('pl'),
        sceneId,
        itemId: action.itemId,
        x: dropped ? action.x! : 18 + (n % 4) * 21,
        y: dropped ? action.y! : 24 + Math.floor(n / 4) * 20,
        w: DEFAULT_ITEM_W,
        rotation: rotations[n % rotations.length],
        z: n + 1,
      };
      return { ...state, placements: [...state.placements, placement] };
    }

    case 'move-placement': {
      // 拖动松手后的提交：只改中心 x/y（场景图百分比），w/rotation/z 原样保留。
      if (state.mode !== 'edit') return state;
      if (!state.placements.some((p) => p.id === action.placementId)) return state;
      return {
        ...state,
        placements: state.placements.map((p) =>
          p.id === action.placementId ? { ...p, x: action.x, y: action.y } : p,
        ),
      };
    }

    case 'resize-placement': {
      // 角手柄缩放松手后的提交：只改 w（宽占图宽百分比），x/y/rotation/z 原样保留。
      if (state.mode !== 'edit') return state;
      if (!state.placements.some((p) => p.id === action.placementId)) return state;
      return {
        ...state,
        placements: state.placements.map((p) =>
          p.id === action.placementId ? { ...p, w: action.w } : p,
        ),
      };
    }

    case 'rotate-placement': {
      // 顶部手柄旋转松手后的提交：只改 rotation，x/y/scale/z 原样保留。
      if (state.mode !== 'edit') return state;
      if (!state.placements.some((p) => p.id === action.placementId)) return state;
      return {
        ...state,
        placements: state.placements.map((p) =>
          p.id === action.placementId ? { ...p, rotation: action.rotation } : p,
        ),
      };
    }

    case 'remove-placement': {
      if (state.mode !== 'edit') return state;
      return {
        ...state,
        placements: state.placements.filter((p) => p.id !== action.placementId),
      };
    }

    case 'set-item-story': {
      // 故事挂在 Item 本身（不挂 Placement）：只改目标 Item 的 story 字段，其余字段与所有
      // Placement 原样不动。因是改 Item，同一 Item 在任何场景的 Placement 都读回同一段故事 →
      // 跨场景天然同步（不存 per-Placement 副本，杜绝新旧不一致）。仅编辑模式可写。
      if (state.mode !== 'edit') return state;
      const target = state.items.find((i) => i.id === action.itemId);
      if (!target) return state; // 目标 Item 不存在 → 拒绝
      if (target.story === action.story) return state; // 无变化 → 免去一次全量落盘
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.itemId ? { ...i, story: action.story } : i,
        ),
      };
    }

    case 'set-item-name': {
      // 物件重命名：名字挂在 Item 本身（不挂 Placement）→ 同一 Item 在任何场景的所有 Placement
      //  都读回同一个名字，天然跨场景同步。空白名忽略（保底不产生无名物件）。仅编辑模式可写。
      if (state.mode !== 'edit') return state;
      const name = action.name.trim();
      if (!name) return state;
      const target = state.items.find((i) => i.id === action.itemId);
      if (!target) return state;
      if (target.name === name) return state; // 无变化 → 免去一次全量落盘
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.itemId ? { ...i, name } : i)),
      };
    }

    case 'add-item': {
      // 上传管线产出入库（U2-S1）：落成一件 source:'user' 的 Item，出现在 dock。
      //  仅编辑模式可写（dock 本就只在编辑模式渲染，此守卫为纵深防御）。
      //  originalImageSrc / displayImageSrc / aspectRatio 按管线实测填；imageSrc 沿用现有存法过渡
      //  （本期为 data: URL；saveState 序列化前把内联图片搬进 IndexedDB、只留引用——见 storage/persistence）。
      //  三个图位本期同源（与内置件、与 splitImages 的处理一致）。空图源 / 非法宽高比拒绝，不产生坏物件。
      if (state.mode !== 'edit') return state;
      // 配额守卫（U3-S2）：已传满 MAX_UPLOADS 件后拒绝入库——纵深防御。UI 已在入口处前置阻止
      //  （UploadEntry 达上限即不再开选图流程），此处保证即便绕过 UI 也绝不产生第 51 件。
      if (userItemCount(state) >= MAX_UPLOADS) return state;
      const src = action.imageSrc;
      if (typeof src !== 'string' || !src) return state;
      const name = action.name.trim() || '新物件';
      const aspectRatio =
        Number.isFinite(action.aspectRatio) && action.aspectRatio > 0 ? action.aspectRatio : 1;
      const item: Item = {
        id: newId('item'),
        name,
        source: 'user',
        aspectRatio,
        originalImageSrc: src,
        displayImageSrc: src,
        imageSrc: src,
        story: '',
      };
      return { ...state, items: [...state.items, item] };
    }

    case 'delete-item': {
      // 删除用户上传件（U3-S1·平权收尾——内置 14 件能做的它都能做，此外还能删）：
      //  · 仅编辑模式可删（dock 本就只在编辑模式渲染，此守卫为纵深防御，兼防游客/程序化误删）。
      //  · 仅 source:'user' 可删——内置 14 件恒不可删（即便 action 被派发也原样返回，杜绝内置件被抹）。
      //  · 一并清掉该物件在**所有场景**的所有 placement（跨场景摆放一并消失、不留残影）。
      //  IndexedDB 里对应的图片二进制由上层（Workbench.handleDeleteItem）异步 deleteImage 清除——
      //  reducer 是纯函数、只管状态树；二者配合即「删除后刷新不复活、图片被清、无残影」。
      if (state.mode !== 'edit') return state;
      const target = state.items.find((i) => i.id === action.itemId);
      if (!target || target.source !== 'user') return state; // 目标不存在 / 内置件 → 拒绝
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.itemId),
        placements: state.placements.filter((p) => p.itemId !== action.itemId),
      };
    }

    case 'hydrate-item-image': {
      // 刷新后回填用户上传件的图片（U2-S2）：saveState 序列化时把用户件的内联图片搬进 IndexedDB、
      //  只在 LocalStorage 留 imageRef，故刷新后 loadState 读回的 user 件三个图位皆空。App 挂载时按
      //  imageRef 从 IndexedDB 取图（object URL）经本动作回填三个图位——物件缩略、入场景渲染、故事原图
      //  一并复活。不设编辑模式守卫：hydrate 与用户意图无关（游客模式下已入场景的用户件也须显示），
      //  且这是纯回填、不改任何用户数据。目标 Item 不存在 / 空图源则拒绝，不产生坏物件。
      const src = action.imageSrc;
      if (typeof src !== 'string' || !src) return state;
      if (!state.items.some((i) => i.id === action.itemId)) return state;
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.itemId
            ? { ...i, imageSrc: src, displayImageSrc: src, originalImageSrc: src }
            : i,
        ),
      };
    }

    case 'set-gallery-name': {
      // 陈列室名（品牌章）就地编辑：改 galleryName，随状态持久化。空白名忽略。
      // 仅编辑模式可写（U3-S2·游客只读复核）：与 set-item-name / set-item-story 同款守卫——
      //  游客模式下陈列室名亦不可改（品牌章重命名入口在 UI 上已随模式收起，此为纵深防御，
      //  杜绝「游客能改动任何数据」）。
      if (state.mode !== 'edit') return state;
      const name = action.name.trim();
      if (!name) return state;
      if (state.galleryName === name) return state;
      return { ...state, galleryName: name };
    }

    default:
      return state;
  }
}
