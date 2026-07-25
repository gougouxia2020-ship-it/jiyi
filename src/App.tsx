// 念念 · 陈列室 —— 应用外壳（M1-S2；U1-S2 补存储失败的界面感知）
//
// 单一 GalleryState 经 useReducer 持有，初始值来自 M1-S1 的 loadState（读不到则初始态）。
// 任一变更（建/切场景、切模式、放物件）后经 saveState 全量落盘（非增量），
// 刷新页面时 loadState 全量读回 → 场景列表、当前场景、布局（placements）完整还原。
//
// U1-S2·终结静默失败：saveState 现在会在写入失败（LocalStorage 配额超限 / 隐私模式、IndexedDB 写失败）
//  时以 StorageError 冒泡。此处捕获并弹一条明确的失败提示——不再「提示成功、刷新就没」地无声吞掉数据。
//  仅失败时 setState：成功路径一律不 setState，保持渲染时序与旧版一致（不额外重渲染、不触动画布/
//  场景图的加载节奏）；提示由用户点「知道了」关闭，下次落盘失败会再次浮现。
import { useEffect, useReducer, useRef, useState } from 'react';
import { loadState, saveState, StorageError } from './storage/persistence';
import { galleryReducer } from './state/gallery';
import { getImageObjectURL } from './storage/imageStore';
import { Workbench } from './components/Workbench';
import './App.css';

export default function App() {
  // 初始状态取自 loadState（读不到则初始态）。E1-S2·游客退出后门：唯一从「游客」切回「编辑」模式的
  //  路径是这条不显眼的 URL 参数（地址后加 ?edit）——供开发/老板预览完游客视图后切回编辑模式用。
  //  界面上模式开关在游客模式整组不渲染（见 Header），访客无按钮可点、无路可回；只有手动改地址带上
  //  ?edit 才在启动时把模式强制为 edit（随后经下方 saveState 落盘持久化，后续即便去掉参数也留在编辑模式）。
  //  正常进入游客模式仍由编辑模式下的「游客」钮触发，本后门不影响。
  const [state, dispatch] = useReducer(galleryReducer, undefined, () => {
    const initial = loadState();
    if (typeof window !== 'undefined') {
      try {
        if (new URLSearchParams(window.location.search).has('edit')) {
          return { ...initial, mode: 'edit' as const };
        }
      } catch {
        // URL 解析异常（极端环境）忽略，按持久化的模式启动。
      }
    }
    return initial;
  });
  // 最近一次落盘失败的面向用户提示（null = 无失败 / 已关闭）。
  const [saveError, setSaveError] = useState<string | null>(null);

  // 会话内为 user 件 hydrate 生成的 blob: objectURL 登记表（itemId → url）。App 是这些 URL 的唯一
  //  创建者（见下方 hydrate 回填），故也由 App 统一 revoke 释放——补上「物件被删除 / 图被替换后
  //  objectURL 从不 revoke」的内存泄漏（E1-S1）。删除/换图的释放由随后的 reconcile effect 兜底比对完成。
  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  // 刷新后回填用户上传件的图片（U2-S2·打通刷新持久化的最后一环）：
  //  saveState 落盘时把用户件的内联图片搬进 IndexedDB、LocalStorage 只留 imageRef（不存二进制），
  //  故 loadState 读回的 user 件三个图位皆空。挂载时按 imageRef 从 IndexedDB 取回二进制、生成会话内
  //  object URL，经 hydrate-item-image 回填——dock 缩略、入场景渲染、故事原图一并复活。仅在挂载时跑一次
  //  （对已持久化的 user 件）；本会话内新上传的 user 件本就带 data:URL，不需回填。取图失败 / IndexedDB
  //  不可用时静默跳过（不连累渲染，也不误报存储错误）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 读挂载时的初始状态：需回填的 = 用户件 + 有 imageRef + 当前图位空。
      const pending = loadState().items.filter(
        (i) => i.source === 'user' && !!i.imageRef && !i.imageSrc,
      );
      for (const item of pending) {
        let url: string | undefined;
        try {
          url = await getImageObjectURL(item.imageRef!);
        } catch {
          url = undefined;
        }
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (url) {
          // 登记新 URL；若同一件此前已登记过一个（重复回填/换图），先 revoke 旧的再覆盖，杜绝泄漏。
          const prev = objectUrlsRef.current.get(item.id);
          if (prev && prev !== url) URL.revokeObjectURL(prev);
          objectUrlsRef.current.set(item.id, url);
          dispatch({ type: 'hydrate-item-image', itemId: item.id, imageSrc: url });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅挂载时跑一次：回填的是持久化里已存在的 user 件（会话内新上传的自带 data:URL）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 删除 / 换图后 revoke（E1-S1·补内存泄漏）：每次 items 变化，逐条比对登记表——
  //  · 对应 Item 已不存在（被删除）→ 释放其 blob URL；
  //  · 对应 Item 的 imageSrc 已不再是登记的那个 URL（图被替换/重新回填）→ 释放旧 URL。
  //  释放后即出表；未命中任何条件（正常回填后 imageSrc===登记 URL）不动。
  useEffect(() => {
    const map = objectUrlsRef.current;
    for (const [itemId, url] of Array.from(map.entries())) {
      const item = state.items.find((i) => i.id === itemId);
      if (!item || item.imageSrc !== url) {
        URL.revokeObjectURL(url);
        map.delete(itemId);
      }
    }
  }, [state.items]);

  // 卸载兜底：把仍在登记表里的 objectURL 全部释放（页面离开时不留悬挂的 blob URL）。
  useEffect(() => {
    const map = objectUrlsRef.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // saveState 为异步（可能要写 IndexedDB）。只在失败时感知并弹提示；成功不 setState。
    saveState(state).catch((err: unknown) => {
      if (cancelled) return;
      setSaveError(err instanceof StorageError ? err.message : '改动没能保存，请稍后重试。');
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  return (
    <>
      <Workbench state={state} dispatch={dispatch} />

      {saveError && (
        <div className="save-error" data-testid="save-error" role="alert" aria-live="assertive">
          <span className="save-error__icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <span className="save-error__msg" data-testid="save-error-msg">
            {saveError}
          </span>
          <button
            type="button"
            className="save-error__close"
            data-testid="save-error-dismiss"
            onClick={() => setSaveError(null)}
          >
            知道了
          </button>
        </div>
      )}
    </>
  );
}
