// 念念 · 陈列室 —— dock 上传入口（U2-S1）
//
// dock 顶部的「＋」卡：点它选图 → 走上传管线(runUploadPipeline) → 弹预览确认 →
//  确认则经 onAddItem 交上层 dispatch add-item 入库、出现在 dock；取消则不入库、无残留。
//
// 游客模式无此入口——dock 整体只在编辑模式渲染（见 Workbench：state.mode === 'edit' && <ItemTray/>），
//  入口长在 dock 内部即天然继承这层隐藏，无需额外判断。
//
// 预览弹层用 createPortal 送到 document.body：dock（.dock）带 transform + overflow:hidden，
//  会为其内的定位浮层建立包含块并裁掉溢出，故预览必须逃出 dock 到 body 顶层渲染。
import { useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { runUploadPipeline, type UploadResult } from './pipeline';

interface UploadEntryProps {
  /** 预览确认后入库：交上层 dispatch add-item（落成 source:'user' 的 Item）。 */
  onAddItem: (item: { name: string; aspectRatio: number; imageSrc: string }) => void;
  /** 已上传的用户件数量（U3-S2·配额）——dock「已传 N/50」的 N。 */
  count: number;
  /** 上传上限（U3-S2·配额）——「已传 N/50」的 50。 */
  max: number;
}

export function UploadEntry({ onAddItem, count, max }: UploadEntryProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 配额（U3-S2）：已传满时，上传入口在**用户点开选图流程之前**就前置阻止——pick() 直接返回、
  //  绝不触发原生选图；卡片切到「已传满」阻止态并常驻一句说明（而非让用户选完图、走完预览才报错）。
  const full = count >= max;

  function pick() {
    if (busy) return;
    // 前置阻止：已达上限即不打开选图流程（不 click 文件选择器）——阻止发生在入口，不在选图之后。
    if (full) return;
    inputRef.current?.click();
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 同一张图可再次选取：用完即清空 input 值（否则选同名同图不再触发 change）。
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const r = await runUploadPipeline(file);
      setResult(r);
      setNameDraft(r.suggestedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : '这张图片没能处理，换一张试试。');
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!result) return;
    onAddItem({
      name: nameDraft.trim() || result.suggestedName,
      aspectRatio: result.aspectRatio,
      imageSrc: result.imageSrc,
    });
    setResult(null); // 收起预览（已入库）
  }

  function cancel() {
    setResult(null); // 取消：不 dispatch、不入库、无残留
  }

  // 弹层内的指针不冒泡到 scrim（scrim 的 pointerdown 会「点空白取消」）。
  function stop(e: ReactPointerEvent<HTMLElement>) {
    e.stopPropagation();
  }

  return (
    <>
      {/* 配额计数（U3-S2）：dock 常驻「已传 N/50」，随每次上传/删除实时更新（count 由状态派生）。 */}
      <div className="upload-quota" data-testid="upload-quota" aria-live="polite">
        已传 {count}/{max}
      </div>

      <button
        type="button"
        className={`upload-add${full ? ' is-full' : ''}`}
        data-testid="upload-add"
        data-full={full ? 'true' : 'false'}
        aria-label={full ? `已达上限，已传满 ${max} 件` : '上传物件'}
        aria-disabled={full || busy}
        title={full ? `已达 ${max} 件上限，删除物件后可再上传` : '上传一张照片，添一件物件'}
        onClick={pick}
        disabled={busy || full}
      >
        {busy ? (
          <span className="upload-add__spin" data-testid="upload-busy" aria-hidden="true" />
        ) : (
          <svg
            className="upload-add__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        )}
        <span className="upload-add__label">{busy ? '处理中…' : full ? '已传满' : '上传物件'}</span>
      </button>

      {/* 已满说明（U3-S2）：常驻于入口处的一句阻止说明——在选图之前就告知传不进去，指明出路。 */}
      {full && (
        <p className="upload-full" data-testid="upload-quota-block" role="status">
          已达 {max} 件上限，删除物件后可再上传。
        </p>
      )}

      {/* 隐藏文件选择器：点＋卡即触发原生选图。 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="upload-input"
        data-testid="upload-input"
        onChange={onFileChange}
        hidden
      />

      {error &&
        createPortal(
          <div className="upload-error" data-testid="upload-error" role="alert" aria-live="assertive">
            <span className="upload-error__msg">{error}</span>
            <button
              type="button"
              className="upload-error__close"
              data-testid="upload-error-dismiss"
              onClick={() => setError(null)}
            >
              知道了
            </button>
          </div>,
          document.body,
        )}

      {result &&
        createPortal(
          <div
            className="upload-preview-scrim"
            data-testid="upload-preview"
            onPointerDown={cancel}
          >
            <div
              className="upload-preview"
              role="dialog"
              aria-modal="true"
              aria-label="确认上传的物件"
              onPointerDown={stop}
            >
              <button
                type="button"
                className="upload-preview__close"
                data-testid="upload-preview-close"
                aria-label="取消"
                onClick={cancel}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>

              <span className="upload-preview__kicker">新物件 · 预览</span>

              <div className="upload-preview__frame">
                <img
                  className="upload-preview__img"
                  data-testid="upload-preview-img"
                  src={result.imageSrc}
                  alt="上传的物件预览"
                  draggable={false}
                />
              </div>

              <label className="upload-preview__namewrap">
                <span className="upload-preview__namecap">名字</span>
                <input
                  className="upload-preview__name"
                  data-testid="upload-preview-name"
                  value={nameDraft}
                  maxLength={40}
                  aria-label="物件名"
                  onChange={(e) => setNameDraft(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>

              <p className="upload-preview__meta" data-testid="upload-preview-meta">
                {result.width}×{result.height}px · 宽高比 {result.aspectRatio.toFixed(2)}
              </p>

              <div className="upload-preview__actions">
                <button
                  type="button"
                  className="upload-preview__btn upload-preview__btn--ghost"
                  data-testid="upload-cancel"
                  onClick={cancel}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="upload-preview__btn upload-preview__btn--save"
                  data-testid="upload-confirm"
                  onClick={confirm}
                >
                  加入陈列
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
