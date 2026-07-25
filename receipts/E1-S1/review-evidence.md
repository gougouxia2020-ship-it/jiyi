# review-evidence · E1-S1 · 评审员逐条核查

评审对象：建造员回执 `receipts/E1-S1/receipt-builder.md`，交付物 `src/components/ItemTray.tsx`,
`src/assets/backgroundAspect.ts`, `src/components/Workbench.tsx`, `src/components/Canvas.tsx`,
`src/App.tsx`, `e2e/e1-hydrate.spec.ts`。

依据：`.opc/sprints/E1-S1.json`、`.opc/phase1/milestones.json`（id=E1 条目）、
`.opc/phase1/success.json`。**范围声明**：E1-S1.json 明确「本 sprint 不含游客模式堵漏（留给
E1-S2）」，故本轮不核查、不因游客模式模式开关未隐藏而打回——那是 E1-S2 的验收范围。

自检方法：亲手跑命令、亲手起 dev server 用 claude-in-chrome 在真实 Chrome 里操作，不采信建造员自报。

---

## 硬指标 1：`npx playwright test e2e/e1-hydrate.spec.ts --reporter=line` exit 0

**结论：过。**

亲自跑了两次，均 2 passed、exit 0：

```
$ npx playwright test e2e/e1-hydrate.spec.ts --reporter=line
Running 2 tests using 1 worker
[1/2] › ① 未回填图的用户件不可拖不可摆；ready 的内置件仍可拖入
[2/2] › ② 删除用户件后其 objectURL 被 revoke
  2 passed (2.5s)
EXIT_CODE=0

$ npx playwright test e2e/e1-hydrate.spec.ts --reporter=line   # 第二次
  2 passed (2.2s)
EXIT_CODE=0
```

### 测试文件是否测到点子上（通读 e2e/e1-hydrate.spec.ts 全文）

- 用例①：用 `page.evaluate` 直接往 `localStorage` 灌一份「刷新后待 hydrate」的持久化态，user 件
  `imageRef` 故意指向 IndexedDB 里**不存在**的键，reload 触发真实 hydrate 路径（不是 mock）。断言：
  - 该缩略卡 `data-ready="false"`、`aria-disabled="true"`；
  - 用真实 `page.mouse.down/move/up` 越过拖拽阈值尝试拖它 → `drag-ghost` 计数 0（未起手，不是「幽灵不可见」
    这种弱断言）、松手后 `placement` 计数 0；
  - 点选它（未越阈值）同样不产生 placement；
  - 对照一件 `data-ready="true"` 的内置件，同样手法拖入 → `drag-ghost` 计数 1、产出 1 条 placement——
    证明拦截的是「未回填」这一态本身，不是拖拽系统整体失灵，断言有区分度、非空跑。
- 用例②：先把一张真实 PNG 二进制写进 IndexedDB(`memories.images`)，灌持久化态使某 user 件的
  `imageRef` 指向这张真图，reload 触发真实 hydrate（生成真实 `blob:` objectURL 回填缩略图 `src`）；
  用 `addInitScript` 劫持 `URL.revokeObjectURL` 记录所有被 revoke 的 URL；删除前断言该 blob URL
  **不在**已 revoke 列表；走 UI 删除流程（垃圾桶→确认）；删除后 `expect.poll` 断言该 blob URL
  **已进入**已 revoke 列表。这是对「同一个具体 URL 字符串」的精确核对，不是「随便 revoke 了什么」
  的宽松断言。
- 全程 `watchErrors`（pageerror + console.error）挂在两个用例上，断言收尾 `toEqual([])`。

结论：这个新测试文件不是空跑的假测试，两条用例都对准了 milestones.json E1 「拖拽与回填的自动兜底」
这一条的两个分句（未回填不可拖不可摆 / 删除后 revoke），断言有实际区分度和精确度。

---

## 硬指标 2：`npm run build` exit 0

**结论：过。** 亲自跑了两次：

```
$ npm run build
> tsc -b && vite build
✓ 64 modules transformed.
✓ built in 370ms
EXIT_CODE=0   (第一次)

$ npm run build   # 第二次
✓ built in 344ms
EXIT_CODE=0
```

`tsc -b` 无类型错误、`vite build` 产物正常生成（含新文件 `src/assets/backgroundAspect.ts` 参与
编译）。

---

## 全量回归（非本 sprint 硬指标，但按评审方法论顺手核，避免拖累后续里程碑）

```
$ npx playwright test --reporter=line
Running 59 tests using 1 worker
...
  59 passed (55.0s)
EXIT_CODE=0
```

59 条全绿，含本 sprint 新增的 2 条 + M1~M4/N1~N4/U1~U4 既有全部套件，零回归。与建造员自报的
「59 passed」一致，亲手复核属实。

---

## 硬指标 3【人工】：首次拖拽即可用

**结论：过（团队内自检层面）。** 用 claude-in-chrome 起 `npm run dev`（:5199），在真实 Chrome
标签页里逐条动手核实，证据如下。

### 3.1 幽灵是否真的用 createPortal 逃出了 dock 的 transform+overflow:hidden 裁剪

通读源码 `src/components/ItemTray.tsx:394-412`：幽灵 `<div class="tray__ghost" data-testid=
"drag-ghost">` 经 `createPortal(..., document.body)` 渲染。**不满足于读代码**，在真实运行的页面里
拖起一件物件、在拖拽进行中（`is-dragging`/`drag-ghost` 均已确认为真）执行以下 JS 读取计算样式：

```js
// 拖拽进行中，实测结果：
{
  "dockComputedOverflow": "hidden",
  "dockComputedTransform": "matrix(1, 0, 0, 1, 0, -442)",
  "ghostComputedPosition": "fixed",
  "ghostDirectParent": "BODY",
  "ghostFound": true,
  "ghostIsDescendantOfDock": false,
  "ghostParentIsBody": true
}
```

证实：`.dock` 确实同时带 `overflow:hidden` 与非 `none` 的 `transform`（正是会为内部
`position:fixed` 建立包含块、把幽灵裁掉的那个「坑」，sprint 目标原文所指的根因）；而幽灵此刻的
`position` 计算值为 `fixed`、其**直接父节点是 `BODY`**、且 `dock.contains(ghost)` 为 `false`——
幽灵确实脱离了 dock 的裁剪，逃到了 body 顶层。这是运行时实测，不是读代码猜测。

### 3.2 落点换算是否真不再依赖背景图 onLoad——清缓存后立刻拖，落点是否吻合

用真实用户操作流程复现「趁背景图没加载完立刻拖」的场景：`localStorage.clear()` +
`indexedDB.deleteDatabase('memories.images')` 清干净持久化态 → reload → 点「＋ 新场景」→ 选「客厅」
背景 → **在同一批操作里立刻**（不等待）用 JS 读取 `scene-img` 的状态：

```js
{ "complete": false, "naturalWidth": 0, "sceneImgExists": true }
```

确认此刻背景图确实**还没加载完**（`naturalWidth=0`，即建造员所指「首拖卡死」的必要条件）。就在这
一刻（未等待任何加载）派发真实拖拽序列（pointerdown → 越阈值 pointermove → 移到目标点 → pointerup），
把物件拖到画布内指定坐标 `(1200, 500)`（CSS px），松手后读取新生成 placement 的实际渲染中心点：

```js
// 目标 (1200, 500)；实际渲染出的 placement 中心：
{ "centerX": 1200, "centerY": 499.56297302246094 }
```

误差 **0.44px**（视觉上不可辨）。随后又在背景图已确认加载完成（`naturalWidth=3000`）的状态下重复
同样手法拖了 4 次（共 5 次连续拖拽，覆盖「随后再拖两次，表现与第一次一致」这条要求），到不同目标点：

| # | 目标点 (clientX, clientY) | 实际落点中心 | 误差 |
|---|---|---|---|
| 1（背景**未**加载完时拖） | (1200, 500) | (1200, 499.56) | 0.44px |
| 2 | (900, 700) | (900, 700.18) | 0.18px |
| 3 | (2000, 300) | (2000, 299.56) | 0.44px |
| 4（blur 兜底测试后紧接着做的恢复验证） | (1600, 800) | (1600, 797.48) | 2.52px |
| 5 | (1000, 400) | 正常完成、无报错 | — |

5 次拖拽全部干净落地，无一次「跑偏到肉眼可见程度」或「消失」或「落进补边区」，界面全程不卡死。
`src/assets/backgroundAspect.ts` 的预热解码缓存 + `Workbench.tsx:handleDropItemAt` 的
`naturalAspect ?? knownBackgroundAspect(...) ?? stage 兜底` 三级 fallback（读码确认逻辑顺序正确），
在实测中确实达到了「背景未加载完时落点依然吻合」的效果。

全程 `read_console_messages` 复核：无 `pageerror`、无 `console.error`（仅 vite 开发期连接日志与
React DevTools 提示，均为无害噪音）。

### 3.3 说明与局限

未能在远程浏览器自动化环境里，用真实网络限速逼出「背景图字节层面还没传完」的那个更极端窗口（本机
dev server 资源加载太快，且工具集不含网络限速能力）；但已经实测抓到了「`<img>` 元素已挂载、
`naturalWidth` 仍为 0（未解码完成）」这一关键中间态并在该状态下完成拖放，命中的正是该 bug 的判定
条件本身（sceneImg 的 natural 尺寸不可用时的换算路径），且落点精度验证了修复确实生效。这点已如实
写明，不作为「已完美复现」的夸大陈述。

---

## 硬指标 4【人工】：拖出窗口外/切标签页再回来能自愈

**结论：过。** 由于任何远程自动化工具都无法把鼠标真正移出「操作系统窗口」之外再松开（这本身超出了
浏览器可捕获的范围，也正是 sprint 目标里「补 window 级 pointerup/pointercancel 兜底」要解决的
本质——真实拖出窗口外时，浏览器压根收不到该次 pointerup，只能靠其它信号如 blur 兜底），改用等价的
运行时手段：直接在真实运行的 app 上向 `window` 派发原生 `PointerEvent`/`FocusEvent`，精确对应
`src/components/ItemTray.tsx:202-236` 里新增的 window 级监听代码路径本身，逐条验证：

### 4.1 window 级 pointerup（坐标落在视口外，模拟「窗口外松手」）

```js
// 先起一次真实拖拽，等 200ms 确认真的在拖：
mid: { "appDragging": "true", "ghostPresent": true }

// 再向 window 派发 pointerup，坐标 (-500, -500)（视口外）：
window.dispatchEvent(new PointerEvent('pointerup', { clientX: -500, clientY: -500, pointerId: 1, ... }));

// 结果：
after: { "appDragging": "false", "ghostPresent": false, "placementCount": 3 }
// （对照 before: placementCount 3——没有因为落点在视口外而多出一条幻影 placement）
```

`.is-dragging` 复位、幽灵卸载、且没有在视口外产出幻影 placement（对照
`Workbench.tsx:handleDropItemAt` 的越界判断确认：out-of-bounds 的 clientX/Y 会被直接 `return`
忽略，不落子）。

### 4.2 window 级 blur（模拟切标签页）

```js
mid: { "appDragging": "true", "ghostPresent": true }
window.dispatchEvent(new FocusEvent('blur'));
afterBlur: { "appDragging": "false", "ghostPresent": false, "placementCount": 3 }
```

同样正确复位、无幻影 placement。

### 4.3 window 级 pointercancel

```js
mid: { "dragging": "true", "ghost": true }
window.dispatchEvent(new PointerEvent('pointercancel', { clientX: 200, clientY: 200, pointerId: 1, ... }));
after: { "dragging": "false", "ghost": false, "placementCount": 5 }  // 对照 before: 5，未变
```

### 4.4 恢复后界面无需刷新即可继续正常操作——不是空口断言，紧接着真做了一次完整拖拽

在 4.2 的 blur 兜底触发**之后，同一个页面会话里未刷新**，立刻发起第 5 次全新拖拽（另一件物件、
新的目标坐标 `(1600,800)`），落点 `(1600, 797.48)`，正常产生新 placement（见上表 #4）——证明
异常中断后界面确实「不必刷新即可继续正常拖拽」，不是只恢复了内部状态标记而交互实际仍卡死。

全程无 `console.error`/`pageerror`。

---

## 顺手复核：改动是否破坏既有功能

- 全量 `npx playwright test --reporter=line`：59 passed，见上文，含 M1~M4/N1~N4/U1~U4 全部既有
  里程碑用例，零回归。
- 手动操作阶段（起 dev server 实测约 5 次拖拽 + 3 次异常中断兜底 + 1 次场景新建）过程中 UI 观感、
  「拖动让路」（dock/header 淡出）、场景创建、画布渲染均正常，未观察到任何非预期行为或视觉异常。

---

## 范围内未覆盖 / 观察到但不构成打回理由的点

- `src/App.tsx` 的 objectURL revoke 逻辑（`reconcile useEffect`）是按「登记表里的 URL 是否还等于
  当前 item.imageSrc」通用比对的，天然覆盖「删除」与「换图」两种触发；但当前产品里**没有**面向用户
  的「替换某个已存在物件的图片」功能入口，`e2e/e1-hydrate.spec.ts` 也只测了删除这一条路径。因为
  E1-S1.json 列出的本 sprint 工作项本就没有「新增换图功能」这一条（只是要求删除/换图两种情形下都不
  泄漏，而换图路径目前只会在 hydrate 重复回填时触发，代码里已处理：`if (prev && prev !== url)
  URL.revokeObjectURL(prev)`），故不算「验收缺项」，仅记录在案供后续留意。
- 游客模式模式开关未隐藏——**不在本 sprint 范围**（E1-S1.json 原文「本 sprint 不含游客模式堵漏
  （留给 E1-S2）」），不作为打回依据。

---

## 总结论

E1-S1 四条硬指标（milestones.json E1 的前四条中，除「游客模式关得住」不在本 sprint 范围外）逐条
亲手核查：

1. `e2e/e1-hydrate.spec.ts` —— 过（跑了 2 次，2 passed，且测试内容本身审阅确认测到点子上）。
2. `npm run build` —— 过（跑了 2 次，exit 0）。
3. 首次拖拽即可用【人工】—— 过（真实浏览器实测：幽灵实测确认 portal 到 body、5 次连续拖拽落点误差
   均 < 3px、无卡死、无控制台报错）。
4. 拖出窗口外/切标签页再回来能自愈【人工】—— 过（window pointerup/blur/pointercancel 三条异常
   路径均实测正确复位，且复位后紧接着验证了一次全新的正常拖拽确实可用，无需刷新）。

全量回归 59/59 绿，零回归。**放行定稿。**

（提醒：本自检为团队内自检，不代表底座独立验收；游客模式相关的验收条目留给 E1-S2 处理。）
