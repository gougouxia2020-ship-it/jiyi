// 念念 · 陈列室 —— 内置素材库清单（B2）
//
// 枚举项目根 backgrounds/（3 张场景图）与 items/（14 件透明抠图物件）。
// 素材文件位于项目根内，以相对路径 import；Vite 生产构建时会把它们
// 打包进 dist/assets（带内容哈希），下面各 imageSrc/thumbSrc 即为
// 构建后可直接使用的资源 URL。素材本体不被移动/改名，仅在此登记引用。

// —— 背景（3 张，id 对齐 idea：reading-nook / living-room / bedroom）——
// N1-S2：书房换用横版场景图 reading-nook-wide-demo.jpg（3000×2000，暖调胶片质感，
// 与客厅/卧室成一组），替换旧竖版 reading-nook-demo.jpg 成为默认书房背景。竖图不再 import
// （不进生产构建）；横图由 backgrounds/reading-nook-demo.jpg 下半段裁切并对齐客厅分辨率量级而来。
import bgBedroom from '../../backgrounds/bedroom-demo.jpg';
import bgLivingRoom from '../../backgrounds/living-room-demo.jpg';
import bgReadingNook from '../../backgrounds/reading-nook-wide-demo.jpg';

// —— 物件（14 件：bedroom-1..6 + living-1..8）——
import itBedroom1 from '../../items/bedroom-1.png';
import itBedroom2 from '../../items/bedroom-2.png';
import itBedroom3 from '../../items/bedroom-3.png';
import itBedroom4 from '../../items/bedroom-4.png';
import itBedroom5 from '../../items/bedroom-5.png';
import itBedroom6 from '../../items/bedroom-6.png';
import itLiving1 from '../../items/living-1.png';
import itLiving2 from '../../items/living-2.png';
import itLiving3 from '../../items/living-3.png';
import itLiving4 from '../../items/living-4.png';
import itLiving5 from '../../items/living-5.png';
import itLiving6 from '../../items/living-6.png';
import itLiving7 from '../../items/living-7.png';
import itLiving8 from '../../items/living-8.png';

/** 背景素材清单条目。 */
export interface BackgroundAsset {
  id: string;
  name: string;
  /** 铺满画布用的原图地址 */
  imageSrc: string;
  /** 缩略（场景条 / 选择器用）；当前无独立缩略图，复用原图 */
  thumbSrc: string;
}

/** 物件素材清单条目。 */
export interface ItemAsset {
  id: string;
  name: string;
  /** 透明抠图原图地址 */
  imageSrc: string;
  /** 缩略（物件抽屉缩略卡用）；透明抠图本身即可作缩略，复用原图 */
  thumbSrc: string;
  /**
   * 真实实体宽高比 = 实体不透明包围盒宽 / 高（裁剪后测得，忽略烘焙软阴影）。
   * 与 items/ 下裁剪后 PNG 的真实实体一致，供选中框/占位按实物比例摆放，
   * 避免阴影撑歪导致标注宽度虚高。由 scripts/check-asset-trim.mjs 校验。
   */
  aspectRatio: number;
}

/** 内置背景（3 张）。id 与 Scene.backgroundId 对应；背景不可重复、场景上限 = 背景数量。 */
export const BACKGROUNDS: readonly BackgroundAsset[] = [
  { id: 'reading-nook', name: '书房', imageSrc: bgReadingNook, thumbSrc: bgReadingNook },
  { id: 'living-room', name: '客厅', imageSrc: bgLivingRoom, thumbSrc: bgLivingRoom },
  { id: 'bedroom', name: '卧室', imageSrc: bgBedroom, thumbSrc: bgBedroom },
];

/** 内置物件（14 件透明抠图）。id 与 Item.id 对应。 */
export const ITEMS: readonly ItemAsset[] = [
  { id: 'bedroom-1', name: '全家福旧照', imageSrc: itBedroom1, thumbSrc: itBedroom1, aspectRatio: 0.8231 },
  { id: 'bedroom-2', name: '旧时书信', imageSrc: itBedroom2, thumbSrc: itBedroom2, aspectRatio: 1.0978 },
  { id: 'bedroom-3', name: '复古毡帽', imageSrc: itBedroom3, thumbSrc: itBedroom3, aspectRatio: 1.4626 },
  { id: 'bedroom-4', name: '旅行背包', imageSrc: itBedroom4, thumbSrc: itBedroom4, aspectRatio: 0.5225 },
  { id: 'bedroom-5', name: '泛黄旧书', imageSrc: itBedroom5, thumbSrc: itBedroom5, aspectRatio: 2.1101 },
  { id: 'bedroom-6', name: '复古闹钟', imageSrc: itBedroom6, thumbSrc: itBedroom6, aspectRatio: 0.7241 },
  { id: 'living-1', name: '相机镜头', imageSrc: itLiving1, thumbSrc: itLiving1, aspectRatio: 0.8723 },
  { id: 'living-2', name: '荣誉奖杯', imageSrc: itLiving2, thumbSrc: itLiving2, aspectRatio: 0.5216 },
  { id: 'living-3', name: '老式收音机', imageSrc: itLiving3, thumbSrc: itLiving3, aspectRatio: 0.7259 },
  { id: 'living-4', name: '黄色甲壳虫', imageSrc: itLiving4, thumbSrc: itLiving4, aspectRatio: 1.8972 },
  { id: 'living-5', name: '潮玩公仔', imageSrc: itLiving5, thumbSrc: itLiving5, aspectRatio: 0.6274 },
  { id: 'living-6', name: '旧地球仪', imageSrc: itLiving6, thumbSrc: itLiving6, aspectRatio: 0.9058 },
  { id: 'living-7', name: '掌上游戏机', imageSrc: itLiving7, thumbSrc: itLiving7, aspectRatio: 0.617 },
  { id: 'living-8', name: '一杯咖啡', imageSrc: itLiving8, thumbSrc: itLiving8, aspectRatio: 1.0639 },
];

/** 场景数量上限 = 内置背景数量（背景不可重复）。 */
export const MAX_SCENES = BACKGROUNDS.length;

/** 按 id 取背景素材。 */
export function getBackgroundById(id: string): BackgroundAsset | undefined {
  return BACKGROUNDS.find((b) => b.id === id);
}

/** 按 id 取物件素材。 */
export function getItemAssetById(id: string): ItemAsset | undefined {
  return ITEMS.find((i) => i.id === id);
}
