// 场景条：场景 chip（切换 / 就地重命名 / 次级入口删除）+ ＋新场景（绑定一张未用背景）。
// 背景不可重复：picker 只列未被占用的背景；用满 3 个后 ＋新场景 置灰 + “素材已用完”。
//
// N3·管理与命名：
//  · 重命名：点已激活的 chip（或双击任一 chip）→ 就地编辑，回车/失焦即存（InlineEdit 统一手感）。
//  · 删除：激活 chip 上浮出一枚 × 次级入口 → 一句话就地确认（不弹大警告框）→ 删除即释放该背景配额、可再建。
import { useEffect, useRef, useState } from 'react';
import type { GalleryState } from '../model/types';
import { availableBackgrounds, canAddScene } from '../state/gallery';
import { InlineEdit } from './InlineEdit';

interface SceneBarProps {
  state: GalleryState;
  onSelectScene: (sceneId: string) => void;
  onCreateScene: (backgroundId: string) => void;
  onRenameScene: (sceneId: string, name: string) => void;
  onDeleteScene: (sceneId: string) => void;
}

/** 场景 chip 上的删除次级入口：× 触发 → 一句话就地确认（删除 / 取消），不弹大警告框。 */
function SceneDelete({ sceneName, onConfirm }: { sceneName: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        className="chip-del"
        data-testid="scene-delete"
        aria-label={`删除场景「${sceneName}」`}
        title="删除这个场景"
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      {confirming && (
        <div
          className="chip-confirm glass"
          role="alertdialog"
          aria-label="确认删除场景"
          data-testid="scene-delete-confirm-box"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 一句话确认（克制语气，不弹大警告框）。 */}
          <span className="chip-confirm__msg">删除「{sceneName}」？</span>
          <button
            type="button"
            className="chip-confirm__yes"
            data-testid="scene-delete-confirm"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
          >
            删除
          </button>
          <button
            type="button"
            className="chip-confirm__no"
            data-testid="scene-delete-cancel"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
          >
            取消
          </button>
        </div>
      )}
    </>
  );
}

export function SceneBar({
  state,
  onSelectScene,
  onCreateScene,
  onRenameScene,
  onDeleteScene,
}: SceneBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const editable = state.mode === 'edit';
  const canAdd = canAddScene(state);
  const available = availableBackgrounds(state);

  // 点击外部关闭 picker。
  useEffect(() => {
    if (!pickerOpen) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  function handlePick(backgroundId: string) {
    onCreateScene(backgroundId);
    setPickerOpen(false);
  }

  return (
    <div className="scenes chrome glass" data-testid="scene-bar">
      <span className="lbl">场景</span>

      {state.scenes.map((scene) => {
        const active = scene.id === state.activeSceneId;
        return (
          <div className="chip-wrap" key={scene.id}>
            <InlineEdit
              value={scene.name}
              onCommit={(name) => onRenameScene(scene.id, name)}
              inputClassName="chip chip-input"
              inputTestId="scene-name-input"
              ariaLabel="重命名场景"
            >
              {(beginEdit) => (
                <button
                  type="button"
                  className={`chip${active ? ' on' : ''}`}
                  aria-pressed={active}
                  data-testid="scene-chip"
                  data-scene-id={scene.id}
                  // 未激活 → 点即切换到该场景；已激活 → 点进去改名（点进去改）。双击任一 chip 也进编辑。
                  onClick={() => (active && editable ? beginEdit() : onSelectScene(scene.id))}
                  onDoubleClick={() => editable && beginEdit()}
                >
                  {scene.name}
                </button>
              )}
            </InlineEdit>

            {/* 删除次级入口：仅在编辑模式、且该 chip 为当前激活场景时浮出。 */}
            {editable && active && (
              <SceneDelete sceneName={scene.name} onConfirm={() => onDeleteScene(scene.id)} />
            )}
          </div>
        );
      })}

      {/* ＋新场景：仅编辑模式可见。可建→虚线 chip 开 picker；用满→置灰 + 提示。 */}
      {editable && (
        <div className="add-wrap" ref={wrapRef}>
          <button
            type="button"
            className={`chip add${canAdd ? '' : ' is-disabled'}`}
            data-testid="add-scene"
            disabled={!canAdd}
            aria-disabled={!canAdd}
            title={canAdd ? '绑定一张未用过的背景，新建一个场景' : '素材已用完'}
            onClick={() => canAdd && setPickerOpen((v) => !v)}
          >
            ＋ 新场景
          </button>

          {!canAdd && (
            <span className="exhausted" role="status" data-testid="scenes-exhausted">
              素材已用完
            </span>
          )}

          {canAdd && pickerOpen && (
            <div className="bg-picker" role="menu" data-testid="bg-picker">
              <div className="bg-picker__hint">选一张背景（不可重复）</div>
              {available.map((bg) => (
                <button
                  type="button"
                  key={bg.id}
                  className="bg-option"
                  role="menuitem"
                  data-testid="bg-option"
                  data-bg-id={bg.id}
                  onClick={() => handlePick(bg.id)}
                >
                  <img src={bg.thumbSrc} alt="" aria-hidden="true" />
                  <span>{bg.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
