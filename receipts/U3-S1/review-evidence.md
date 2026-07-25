# U3-S1 评审证据（reviewer）

## 已读材料（开工前逐字读完，未采信建造员自述）
- `/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/reviewer.md`
- `/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/review-against-criteria.md`
- `/Users/yuriiiz/Projects/Memories/.opc/phase1/milestones.json`（id="U3" 全文，含 criteria[0]）
- `/Users/yuriiiz/Projects/Memories/.opc/phase1/success.json`（「平权」「删除干净不留尸」两条）
- `/Users/yuriiiz/Projects/Memories/.opc/sprints/U3-S1.json`（goal 全文，含【验收硬指标】段）
- `/Users/yuriiiz/Projects/Memories/receipts/U3-S1/receipt-builder.md`
- `/Users/yuriiiz/Projects/Memories/.opc/phase1/taste/taste.json`、`/Users/yuriiiz/Projects/Memories/src/styles/tokens.css`（视觉判据）

## 核查尺子（仅本 sprint 点名子集，不误伤全量 U3 milestone）
1. 删除入口仅对 `source==='user'` 出现，内置 14 件无删除入口。
2. 删除用户物件后：所有场景摆放一并清空、IndexedDB 图片二进制清除、刷新不复活、无残影。
3. 拖入/挪位/缩放/旋转/写故事/重命名/跨场景故事同步，用户件与内置件行为一致。
4. 删除入口视觉落在「旧信·沉浸」规范内（对照 taste.json + tokens.css，非个人口味）。
5. `npm run build` exit 0 无类型错误。
6. 全量套件 9 条既有失败是否真为本 sprint 之前就存在、且本次改动未使其恶化（非本 sprint 验收范围，仅核实建造员判断不是睁眼说瞎话）。

## 1. 删除入口分流——读代码 + 亲手跑

`src/components/ItemTray.tsx` 第 253-255 行：
```jsx
{item.source === 'user' && (
  <ItemDelete itemName={item.name} onConfirm={() => onDeleteItem(item.id)} />
)}
```
内置 14 件的 `item.source` 恒为 `'builtin'`（见 `src/assets/manifest.ts` 构造），此条件天然不渲染删除入口，无需额外禁用逻辑。

`src/state/gallery.ts` 第 262-264 行（reducer 纵深防御）：
```js
if (state.mode !== 'edit') return state;
const target = state.items.find((i) => i.id === action.itemId);
if (!target || target.source !== 'user') return state; // 目标不存在 / 内置件 → 拒绝
```
即便有人绕过 UI 直接 dispatch `delete-item` 打内置件 id，reducer 也原样拒绝——UI 层 + 状态层双重把关。

亲手跑（非采信建造员自述）：
```
$ npx playwright test e2e/u3-s1-parity-selftest.spec.ts --reporter=line
Running 3 tests using 1 worker
  3 passed (9.9s)
```
测试①逐一断言：初始 14 件内置物件 `item-delete` count=0；上传 1 件后 dock 15 件、`item-delete` count=1 且落在该 user 件缩略卡内部；再传一件后 count=2；并用 `page.evaluate` 遍历 DOM 逐一核对 14 件内置缩略卡内部（非 `item-` 前缀 id）零删除入口。判定：**过**。

## 2. 删除干净不留尸——读代码 + 亲手跑

`src/state/gallery.ts` 第 265-269 行（`delete-item` case）：
```js
return {
  ...state,
  items: state.items.filter((i) => i.id !== action.itemId),
  placements: state.placements.filter((p) => p.itemId !== action.itemId),
};
```
`placements` 过滤条件只看 `itemId`、不看 `sceneId`——天然清掉**所有场景**里该物件的摆放，不是只清当前场景。

`src/components/Workbench.tsx` 第 72-80 行（`handleDeleteItem`）：
```js
function handleDeleteItem(itemId: string) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item || item.source !== 'user') return;
  const ref = item.imageRef ?? `img-${item.id}`;
  dispatch({ type: 'delete-item', itemId });
  void deleteImage(ref).catch((err) => { console.warn(...); });
}
```
键的推导 `item.imageRef ?? \`img-${item.id}\`` 与 `src/storage/persistence.ts` 第 154-155 行落盘时的引用键推导逻辑逐字一致（`const ref = item.imageRef ?? \`img-${item.id}\`;`），确认同会话新传件（内存态尚无 imageRef）与刷新后已落盘件（imageRef 已回填）两种情形算出的键相同，不会出现键不匹配导致图删不掉的漏洞。

`src/storage/imageStore.ts` 第 87-90 行 `deleteImage`：`store.delete(id)`，IndexedDB 不可用时优雅降级为 resolve（不阻断状态删除）。

亲手跑测试③（跑进两个场景后删除）：全程通过（含：先测「取消」不误删；再删除后 dock 回 14 件、当前场景摆放消失、切另一场景摆放也消失、`readStore` 状态树 items/placements 均不含该 id、`idbCount` 归零；`page.reload()` 后再次核对 dock 无该件、两场景均无摆放、IndexedDB 仍为 0）。判定：**过**。

## 3. 平权逐项核对——读代码 + 亲手跑

读 `src/state/gallery.ts` 的 `place-item`（128-153行）、`move-placement`（155-165行）、`resize-placement`（167-177行）、`rotate-placement`（179-189行）、`set-item-story`（199-213行）、`set-item-name`（215-228行）六个 reducer case：全部只按 `itemId`/`placementId` 查找目标、**无任何 `item.source` 分支判断**，用户件与内置件走同一套代码路径（与 U2-S2 review-evidence.md 第 130-156 行已核实的结论一致，本轮未新增平行逻辑）。

亲手跑测试②：对一件真实上传件驱动真实 UI——拖入（书房场景）→断言 placement style 只含 `translate(...)` 不含 `left`（走 transform，非重排，与内置件同款）→挪位只改 x/y→角手柄缩放只改 w→旋转钮只改 rotation→写故事→dock 就地重命名→切场景「客厅」再摆一次同一物件→故事与新名均同步显示→刷新后物件/新名仍在。逐字段隔离断言（如 `expect(afterScale.x).toBe(afterMove.x)`）证明每步操作只改对应字段、其余字段不受扰——与内置件行为模式完全一致。判定：**过**。

## 4. 视觉是否落在「旧信·沉浸」规范内——对照 taste.json + tokens.css 逐条判

taste.json 摘要（第 2 行）规定：满屏浮层统一走「毛玻璃四件套（--glass-* token：半透明奶油底+backdrop-blur）」；工艺底线「UI 标签/分区标题字号不得低于 token 下限」。

`src/App.css` 807-830 行 `.thumb-del`：
```css
border: var(--rule) solid var(--glass-line);
border-radius: 50%;
background: var(--glass-bg);
-webkit-backdrop-filter: blur(var(--glass-blur));
backdrop-filter: blur(var(--glass-blur));
...
box-shadow: var(--shadow-glass);
```
与 `.glass`（App.css 354-360 行）用的同一套 token（`--glass-bg`/`--glass-line`/`--glass-blur`/`--shadow-glass`），材质等价，属既有玻璃浮层规范内。`.thumb-del:hover`（837-840行）切换为 `var(--color-accent)`（陶土红，tokens.css 第 15 行定义），符合「陶土红强调」DNA。

`.thumb-confirm`（853-911行）直接复用 `.glass` class（ItemTray.tsx 第 77 行 `className="thumb-confirm glass"`），确认弹层材质走统一玻璃规范；`.thumb-confirm__yes`（892-896行）背景 `var(--color-accent)`（陶土红 CTA），与 SceneBar 既有的场景删除确认同款语气一致。

字号核查（逐处对照 tokens.css 第 75 行 `--text-label-min:11px`）：
- `.thumb-confirm__msg`（868-872行）：`font-size: 12px` —— 高于 11px 下限。
- `.thumb-confirm__yes`/`.thumb-confirm__no`（883行）：`font-size: var(--text-label-min)` —— 恰等于 11px 下限，不低于。
- 全文 `grep font-size src/App.css` 未发现本次新增区块内有任何显式小于 11px 的字号（唯一裸写 `11px` 的是第 1616 行既有响应式断点，非本次改动）。

判定：删除入口视觉材质、强调色、字号均落在既有 taste.json / tokens.css 规范内，非评审个人偏好判断。**过**。

## 5. `npm run build`——亲手跑

```
$ npm run build
> tsc -b && vite build
✓ 63 modules transformed.
...
✓ built in 834ms
```
exit 0，无类型错误。判定：**过**。

## 6. 全量套件 9 条既有失败——独立核实建造员判断

亲手跑（非采信自述）：
```
$ npx playwright test --reporter=line
...
9 failed
    m2-transform.spec.ts:84
    m2-transform.spec.ts:199
    m3-story.spec.ts:110
    m4-full.spec.ts:412 （PC / 768px / 375px 三条）
    n1-foundation.spec.ts:98
    n1-foundation.spec.ts:152
    n1-foundation.spec.ts:196
43 passed (1.9m)
```
与建造员回执第五节所列 9 条**逐条同名同行号**。

交叉核对根因（读代码独立验证，非采信建造员断言）：
- `src/storage/persistence.ts` 第 31 行：`export const SCHEMA_VERSION = 4;`——`n1-foundation.spec.ts`/`m3-story.spec.ts` 断言 `schemaVersion===2` 已过时（schema 早在 U1 升到 v4）。
- `src/model/types.ts` 第 69-83 行 `Placement` 接口：字段为 `x/y/w/rotation/z`，**无 `scale` 字段**（`w` 是 N1·schema v3 引入的替代字段）——`m2-transform.spec.ts`/`m4-full.spec.ts` 里对 `scale` 字段的断言已因数据模型演进失效。

历史基线交叉验证（本项目非 git 仓库，改用既往独立评审证据链比对，逐轮同名同因）：
- `receipts/U1-S3/review-evidence.md` 第 55-64 行：U1-S3 收工时（早于本 sprint 至少 4 轮）独立复现 **29 passed / 9 failed**，且评审员亲自把新增 e2e 文件移出再跑一次得到同一批 9 个失败（`IDENTICAL FAILURE SETS`），归因同一 schemaVersion/scale 字段问题。
- `receipts/U2-S2/review-evidence.md` 第 42-60 行：U2-S2 收工时独立复现 **40 passed / 9 failed**，并交叉引用 U2-S1 的 **35 passed / 9 failed**，三轮失败清单逐条同名同因。
- 本轮（U3-S1）**43 passed / 9 failed**——passed 数随每轮新增 e2e 稳定递增（29→33→35→40→43），failed 恒为同一批 9 条，跨至少 5 轮独立评审（U1-S3/U2-S1/U2-S2/U3-S1 + 本轮）从未变化。

判定：建造员「9 条既有失败为更早 sprint 遗留、与本次改动无关」的判断**成立**，非睁眼说瞎话；本次改动（gallery.ts 的 delete-item / Workbench.tsx 的 handleDeleteItem / ItemTray.tsx 的 ItemDelete / App.css 的 .thumb-del·.thumb-confirm）不触碰 schema 版本号、Placement 字段结构或旧坐标数学，与这 9 条失败的根因（schema v2→v4 演进、N1 起 scale→w 字段替换）无交集。**这 9 条不是本 sprint U3-S1 的验收范围**，仅确认建造员判断无误，不作为放行/打回依据。

## 越界检查
未拿标准之外的个人偏好（如删除按钮触摸命中区大小 22px 未对照 `--h2-hit` 之类不在本 sprint 硬指标内的项）作为打回依据；`e2e/u3-parity.spec.ts`（官方文件名）本 sprint 未创建，但 U3-S1.json goal 原文明确「配额与游客只读留给下一 sprint」且自认「官方 e2e/u3-parity.spec.ts 留给评审/下个 sprint」，本 sprint 契约只要求本 sprint 范围内的删除能力与平权查漏功能达标、并留自证 e2e——已达标，不因文件命名未对齐官方 spec 而打回。

## 总裁决
六条尺子逐条亲手核查（读代码、跑命令、跑 e2e、对照 tokens.css/taste.json 原文），未发现「标准没达到」的问题。

**判定：通过（pass）。**
