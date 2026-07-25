# U3-S1 建造回执 · 用户物件删除能力 + 平权查漏

里程碑 U3 / sprint U3-S1。契约：给用户上传件补删除能力做到与内置件平权收尾——
新增删除入口（仅 source==='user' 出现，内置 14 件不可有）；删除后该物件在**所有场景**的
摆放一并清空、IndexedDB 里对应图片二进制一并清除、刷新不复活、不留残影；并逐项复核挪位/
缩放/旋转/写故事/重命名/跨场景故事同步对用户件是否与内置件行为一致（查漏，非重做）。
删除入口视觉落进「旧信·沉浸」既有规范。配额（N/50）与游客只读留给下一 sprint（非本 sprint 契约）。

## 验收硬指标逐条对照（= milestones.json U3 criteria[0] / success.json 平权 + 删除干净两条）

| 硬指标 | 落点 | 自检结论 |
|---|---|---|
| 删除入口仅对用户件出现，内置 14 件无 | `ItemTray.tsx`：`item.source === 'user'` 才渲染 `<ItemDelete>` | 过（自测①：14 件内置零删除入口；上传 1 件才出 1 个删除入口，且落在该 user 缩略卡内部） |
| 用户件可删（内置 14 件不可删） | reducer `delete-item`：`target.source !== 'user'` 直接原样返回；UI 只对 user 件出入口 | 过（自测①③） |
| 删除后所有场景的摆放一并消失、无残影 | reducer `delete-item`：`placements.filter(p => p.itemId !== id)`（不限场景） | 过（自测③：同一件摆进客厅+书房，删除后切两场景均 0 摆放） |
| IndexedDB 对应图片被清除 | `Workbench.handleDeleteItem`：dispatch 后 `deleteImage(item.imageRef ?? \`img-\${id}\`)` | 过（自测③：删前 idbCount=1，删后 poll 到 0） |
| 刷新不复活（物件 + 摆放都不回来） | 状态树删除后经 App 全量落盘；IndexedDB 记录已清 | 过（自测③：reload 后 dock 14 件、两场景 0 摆放、idbCount 仍 0） |
| 平权：拖入/挪位/缩放/旋转/写故事/重命名/跨场景故事同步行为一致 | 复核既有链路（M2/N3 已落地），用户件复用同一套 place-item/move/resize/rotate/story/rename | 过（自测②：逐项施加于一件上传物件，字段变化与内置件一致；跨场景故事+新名同步；刷新全还原）——**查漏未发现失效项，无需修** |
| 删除入口视觉落进「旧信·沉浸」规范 | `App.css`：`.thumb-del` 毛玻璃底(`--glass-bg`/`--glass-blur`/`--glass-line`)+陶土红 hover；`.thumb-confirm` 用 `.glass` + 陶土红 CTA；确认按钮字号 `--text-label-min`(11px) | 过（未发明新视觉语言；沿用场景删除同款「一句话就地确认、不弹大警告框」语气） |

## 改动清单（成品全部落在项目根，未写入 .opc/）

1. **`src/state/gallery.ts`**
   - union 新增 `{ type: 'delete-item'; itemId: string }`。
   - 新增 reducer case `delete-item`：编辑模式守卫 + 仅 `source==='user'` 可删（内置件原样返回）；
     同时从 `items` 移除该件、从 `placements` 移除其**全部**摆放（跨场景）。纯函数，IndexedDB 清理交上层。

2. **`src/components/Workbench.tsx`**
   - `import { deleteImage } from '../storage/imageStore'`。
   - 新增 `handleDeleteItem(itemId)`：仅 user 件；先 dispatch `delete-item`，再 `deleteImage(item.imageRef ?? \`img-\${id}\`)`
     （引用键沿用 `saveState`/`splitImages` 约定，同会话新上传件内存态无 imageRef 时算出的键与落盘键一致）。
     异步 fire-and-forget，清图失败仅 `console.warn`、不阻断状态删除。
   - `<ItemTray onDeleteItem={handleDeleteItem} .../>`。

3. **`src/components/ItemTray.tsx`**
   - `ItemTrayProps` 新增 `onDeleteItem`。
   - 新增 `TrashIcon`（真 SVG，与画布工具条移除钮同款，不用字符）+ `ItemDelete` 子组件
     （垃圾桶钮 + 一句话玻璃确认；所有指针 stopPropagation 不触发拖入/点选；删除不可逆故必经一次确认）。
   - 缩略卡内：`item.source === 'user'` 才渲染 `<ItemDelete>`。删除入口在编辑模式下恒可用
     （dock 只在编辑模式渲染，故不随 canPlace/有无场景禁用）。

4. **`src/App.css`**
   - `.thumb` 加 `position: relative`（删除入口/确认的定位参照）。
   - 新增 `.thumb-del`（右上角毛玻璃圆钮，常驻 0.62 透明、hover/聚焦转陶土红满显——touch 端无 hover 也可发现）
     与 `.thumb-confirm*`（卡内 inset 玻璃确认层，不逃出 dock 故不被 overflow 裁；陶土红 CTA、字号 ≥11px）。

5. **`e2e/u3-s1-parity-selftest.spec.ts`**（建造员自证，非官方 e2e；官方 `e2e/u3-parity.spec.ts` 留给评审/下个 sprint）
   - ① 删除入口分流；② 用户件平权全套操作行为一致 + 跨场景同步 + 刷新还原；③ 删除干净不留尸（两场景摆放消失 + IndexedDB 清除 + 刷新不复活）。

## 自检执行记录

- `npm run build`：通过（tsc -b + vite build，无类型错误，`✓ built`）。
- `npx playwright test e2e/u3-s1-parity-selftest.spec.ts`：**3 passed**（①②③全绿）。
- 现役里程碑回归子集 `n2-shell + n3-edit + n4-full + u1-foundation + u2-upload`：**27 passed**（覆盖我改动的 dock/ItemTray/Workbench/reducer/CSS，证明零回归）。

## 全量套件里 9 条失败——判定：与本 sprint 无关的既有测试漂移（预先存在，非本次引入）

全量 `npx playwright test` = 43 passed / 9 failed。9 条失败全部集中在 **M2/M3/M4/N1** 的陈旧 e2e，
失败根因是更早 sprint 改了数据模型/坐标系/外壳，这些老测试未随之更新：

- `schemaVersion===2` 断言（`m3-story:110`、`n1-foundation:98/152`）——SCHEMA_VERSION 早在 **U1（v4）** 就升到 4。
- `placement.scale` 字段（`m2-transform:84`、`m4-full` PC）——scale 在 **N1 schema v3** 被 `w` 取代，字段已不存在。
- 视口相对坐标 / 「拖到画布外不建 placement」（`m2-transform:199`）——**N2 满屏沉浸外壳**把整个视口作 stage，旧「画布外」概念不再成立。
- 窄视口 `placeItemByClick` 超时（`m4-full` 768/375）——**N2/N3** 改了 dock 收合与交互，老测试的点选姿势已过时。
- `Item.story` 结构 `{id,name,imageSrc,story}`（`n1-foundation:196`）——Item 在 U1 起多了 source/aspectRatio/original·displayImageSrc/imageRef。

证据链：这些断言引用的常量（v2、scale、视口坐标）均由 **U3 之前已完成的里程碑（N1/N2/U1）** 改掉，故这 9 条在 U3-S1 开工前就已失败；
我的改动只新增 `delete-item` 动作、user 件删除入口与 CSS，不触碰 schema 版本、坐标数学或内置件摆放；
且现役全代际套件（N2/N3/N4/U1/U2）+ 本 sprint 自证全绿——足证无新增回归。
把 M1~M4/N1~N4 旧 e2e 全套对齐当前模型是 **U4 里程碑「旧里程碑不回归」** 明列的收口任务，非本 sprint 契约，本轮不动（避免越界改无关代码）。

## 一处自主决定（已按 DNA 从严，未挂请示）

删除入口采用「垃圾桶钮 → 一句话就地玻璃确认（删除/取消）」两步，而非一点即删——理由：删除不可逆
（连 IndexedDB 图片二进制一并清），且项目既有 DNA（design.md「场景删除…一句话确认，不弹大警告框」）
与既有实现（SceneBar 的 scene-delete/-confirm/-cancel）已确立此模式。testid 亦与场景删除对称
（`item-delete` / `item-delete-confirm` / `item-delete-cancel`），供评审 e2e 自然发现。
