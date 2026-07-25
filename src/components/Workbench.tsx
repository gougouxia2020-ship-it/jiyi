// 满屏沉浸外壳（N2-S1）：整个浏览器视口 = 一间房。场景铺满视口（Canvas 作满屏画布），
// 报头 / 场景条 / 物件抽屉改为浮在房间之上的浮层（本 sprint 先做最简过渡：定位浮层、暖奶油底，
// 尚不做毛玻璃质感与拖动让路，那些留给 N2-S2）。拆掉了旧的定宽 Workbench（报头+场景条+[抽屉|画布]）。
import { useState, type Dispatch } from 'react';
import type { GalleryState } from '../model/types';
import type { GalleryAction } from '../state/gallery';
import { activeScene } from '../state/gallery';
import { knownBackgroundAspect } from '../assets/backgroundAspect';
import { deleteImage } from '../storage/imageStore';
import { Header } from './Header';
import { SceneBar } from './SceneBar';
import { ItemTray } from './ItemTray';
import { Canvas } from './Canvas';

interface WorkbenchProps {
  state: GalleryState;
  dispatch: Dispatch<GalleryAction>;
}

export function Workbench({ state, dispatch }: WorkbenchProps) {
  const scene = activeScene(state);
  const canPlace = state.mode === 'edit' && !!scene;

  // —— 浮层外壳的两个纯 UI 开关（不入持久化）——
  //  dragging：任一物件拖动手势进行中（dock 拖出 / 画布挪动）。挂到 .app 上驱动「拖动让路铁律」——
  //   .app.is-dragging .chrome 全部浮层淡出且 pointer-events:none，让物件能落到浮层平时覆盖的区域。
  //  uiHidden：隐藏界面（眼睛）——收起全部浮层纯看房间，唯留眼睛一枚幽灵钮可恢复。
  const [dragging, setDragging] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);

  // 抽屉拖入：把视口落点换算成「场景图坐标系内的中心百分比」（schema v3）。参照系 = contain 后的
  // 场景图矩形 imgRect（由场景图 natural 尺寸算 contain 几何）。允许落在图外（<0 或 >100）→ 摆进补边区。
  function handleDropItemAt(itemId: string, clientX: number, clientY: number) {
    if (!canPlace) return;
    const stage = document.querySelector('[data-testid="canvas"]') as HTMLElement | null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    // 落在视口（=整块 stage）之外才忽略；满屏后正常拖入总在视口内。
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return;
    }
    // 场景图矩形（contain 几何）：aspect 取背景图**固有宽高比**（E1-S1）。优先读可见 <img> 的 natural
    //  尺寸（已加载完），未加载完时读预热缓存里「已知的固有宽高比」——**不再退化成 stage 比例**（那会让
    //  首拖落点跑偏、落进模糊补边区，即「只卡第一次」的落点漂移）。两者皆无（极早期首帧）才最后兜底 stage。
    const img = document.querySelector('[data-testid="scene-img"]') as HTMLImageElement | null;
    const naturalAspect =
      img && img.naturalWidth > 0 && img.naturalHeight > 0
        ? img.naturalWidth / img.naturalHeight
        : undefined;
    const aspect =
      naturalAspect ??
      knownBackgroundAspect(scene?.backgroundId) ??
      (rect.height > 0 ? rect.width / rect.height : 1);
    const iw = Math.min(rect.width, rect.height * aspect);
    const ih = iw / aspect;
    const ox = (rect.width - iw) / 2;
    const oy = (rect.height - ih) / 2;
    // 指针视口点 → stage 内 px → 图内中心百分比（不钳制，允许出界进补边区）。
    const lx = clientX - rect.left;
    const ly = clientY - rect.top;
    const x = iw > 0 ? ((lx - ox) / iw) * 100 : 50;
    const y = ih > 0 ? ((ly - oy) / ih) * 100 : 50;
    dispatch({ type: 'place-item', itemId, x, y });
  }

  // 删除用户上传件（U3-S1）：状态树删除（物件 + 其在所有场景的摆放，见 reducer 的 delete-item）与
  //  IndexedDB 图片二进制清除，一并做在这一处。只删 source:'user'（纵深防御——UI 已只对 user 件出删除
  //  入口、reducer 也只删 user 件）。图片键沿用 saveState 的引用约定（item.imageRef ?? `img-${id}`）：
  //  同会话新上传件在内存态尚无 imageRef，但落盘用的键恒为 `img-${id}`，两种情形算出的键一致。
  //  deleteImage 异步、fire-and-forget：删不存在的键无害、IndexedDB 不可用时直接 resolve；清图失败不
  //  阻断状态删除（状态树已更新、刷新不复活），仅记一条告警不打扰用户。
  function handleDeleteItem(itemId: string) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item || item.source !== 'user') return;
    const ref = item.imageRef ?? `img-${item.id}`;
    dispatch({ type: 'delete-item', itemId });
    void deleteImage(ref).catch((err) => {
      console.warn('删除物件时清除图片二进制失败（状态已删除，刷新不复活）：', err);
    });
  }

  return (
    <div
      className={`app${dragging ? ' is-dragging' : ''}${uiHidden ? ' ui-hidden' : ''}`}
      data-testid="app"
      data-dragging={dragging ? 'true' : 'false'}
      data-ui-hidden={uiHidden ? 'true' : 'false'}
    >
      {/* 满屏画布：场景自适应层 + 物件层（占满整个视口，压在浮层之下）。 */}
      <Canvas state={state} scene={scene} dispatch={dispatch} onDragChange={setDragging} />

      {/* 浮层玻璃四件套：品牌章 + 模式开关/隐藏界面钮（报头）· 场景条 · 物件 dock。浮在房间之上。 */}
      <Header
        mode={state.mode}
        onModeChange={(mode) => dispatch({ type: 'set-mode', mode })}
        galleryName={state.galleryName}
        onRenameGallery={(name) => dispatch({ type: 'set-gallery-name', name })}
        uiHidden={uiHidden}
        onToggleUi={() => setUiHidden((v) => !v)}
      />

      <SceneBar
        state={state}
        onSelectScene={(sceneId) => dispatch({ type: 'select-scene', sceneId })}
        onCreateScene={(backgroundId) => dispatch({ type: 'create-scene', backgroundId })}
        onRenameScene={(sceneId, name) => dispatch({ type: 'rename-scene', sceneId, name })}
        onDeleteScene={(sceneId) => dispatch({ type: 'delete-scene', sceneId })}
      />

      {state.mode === 'edit' && (
        <ItemTray
          items={state.items}
          canPlace={canPlace}
          onPlaceItem={(itemId) => dispatch({ type: 'place-item', itemId })}
          onDropItemAt={handleDropItemAt}
          onDragChange={setDragging}
          onRenameItem={(itemId, name) => dispatch({ type: 'set-item-name', itemId, name })}
          onAddItem={(item) => dispatch({ type: 'add-item', ...item })}
          onDeleteItem={handleDeleteItem}
        />
      )}
    </div>
  );
}
