# U4-S2 建造回执（builder）

## 任务
把 `e2e/u4-full.spec.ts` 的全链路（传照片→建场景→摆物件→写故事→切游客看故事）从单一 PC 视口
扩展到**横屏手机 844×390** 视口，PC 与横屏手机双视口均验证：无横向溢出（真实测量 scrollWidth ≤
clientWidth）、无 console 未捕获错误、无未处理的 Promise 拒绝；就地修复发现的响应式布局缺陷；人工
核对整体视觉仍守「旧信·沉浸」DNA（上传相关新界面元素尤其对照 taste 规范）；收尾跑全量 playwright
套件确认不回归。

验收命令（均须 exit 0）：
- `npx playwright test e2e/u4-full.spec.ts --reporter=line`
- `npx playwright test --reporter=line`（全量回归）

## 验收硬指标 → 交付覆盖对照（倒推清单）
milestones.json U4 criteria 逐条：

1. **全流程双端 e2e（command）**：`e2e/u4-full.spec.ts` 现以 `VIEWPORTS` 数组驱动，PC(1920×1080) 与
   横屏手机(844×390) 各生成一条独立 test，逐一跑通同一条 `runFullChain`（① 传照片选图→预览→确认入库→
   已传 0/50 升 1/50 → ② 建场景 → ③ 从 dock 拖入该上传件、挪位、角手柄缩放 → ④ 写故事落盘 v4 →
   ⑤ 刷新逐字段还原（含 IndexedDB hydrate 回填 blob）→ ⑥ 切游客只读弹故事+原图、无编辑入口）。
   每个关键节点 `assertNoHorizontalOverflow`，全程 `attachErrorGuards`/`assertNoRuntimeErrors` 守卫
   pageerror + 页内 unhandledrejection + console error（排除 `Failed to load resource` 网络失败）。
   → **两视口均 exit 0**（见下命令输出）。

2. **旧里程碑不回归（command，全量套件绿）**：全量 `npx playwright test` 57 passed / exit 0
   （U4-S1 基线为 56；本轮 u4-full 由 1 test 变 2 test 故 +1，其余 55 条既有 e2e 全绿、无回归）。

3. **整体仍还原「旧信·沉浸」DNA（manual）**：在 844×390 逐一截图核验上传/摆放/故事全部界面元素
   （见下「视觉 DNA 人工核验」），新增上传元素（＋入口 / 已传 N/50 / 预览弹窗 / 配额提示）均守既有
   规范；判定护栏内的「裸矩形原图」（上传件以绿矩形原样入场、背景保留、贴纸感）未据此判失败，只判
   新增界面元素是否守 DNA。

## 改动清单

### 测试（交付主体）
- `e2e/u4-full.spec.ts`：**重构为双视口参数化**。
  - 由单一 `VP` 常量改为 `VIEWPORTS = [{1920×1080,'PC1920'},{844×390,'横屏手机844×390'}]`，
    原单 test 的整段流程抽成 `runFullChain(page, vp)`，末尾 `for (const vp of VIEWPORTS)` 各生成一条
    独立 test。断言逻辑一字未减，只把视口标签/视口尺寸参数化。
  - 故事三段操作（openStoryEditor / writeStory / readStoryViaEditor）**包进 `withUiHidden`**
    （沿用 M4-S2 收口 spec 已验证写法）：N2 满屏后报头/场景条/dock 是浮层，而选中态故事工具条
    「悬于选框上方」属画布内元素——窄矮视口（390px 高）下工具条会被顶部报头等浮层盖住而不可点；
    用应用自带「隐藏界面」（眼睛钮 `toggle-ui`）一键收起全部浮层，整段故事操作期间不挡道，操作完
    再恢复。PC 下浮层本不挡道、包裹亦无害（M4-S2 已证 PC 通吃）。
  - `boxOf` 保留 `scrollIntoViewIfNeeded`（横屏手机 dock 列表纵向滚动、故事弹窗贴底，目标元素可能在
    初始可视范围外；page.mouse 按视口坐标派发，须先滚入视口）。
  - 摆物件挪位落点用「画布正中(0.5,0.5)」而非高位：窄矮视口上下留白最小，正中让四角手柄稳落画布
    可点区（随后手柄断言即验此）。

### 源码（响应式缺陷就地修复）
- `src/App.css`：在既有 `@media (max-height: 560px)` 段（矮视口/横屏手机）内**新增上传预览弹窗收紧规则**。
  - **缺陷**：预览弹窗 `.upload-preview__img { max-height: 46vh }`（390 视口下≈179px）叠加 kicker/名字
    输入/元信息后，整窗高超过 `max-height: calc(100vh - 2*space-md)`（≈358px）上限，把
    「取消 / 加入陈列」操作区顶到弹窗内部滚动线以下——用户在横屏手机打开预览即**看不到主操作按钮**，
    须在弹窗内滚动才够得着（属 sprint 点名的「弹窗超出视口 / 控件挤压」响应式缺陷）。截图 shot2（修复前）
    实测操作区落在 390px 视口底缘以下。
  - **修复**：矮视口下 `.upload-preview` padding 22/20→16/16、`__kicker` margin-bottom 12→8、
    `__frame` padding 10→8、`__img` max-height 46vh→30vh(≈117px)、`__namewrap` margin-top 14→10、
    `__meta` margin-top 8→6、`__actions` margin-top 16→12。收紧后预览图+名字输入+操作区一屏内全部落位、
    无需滚动（截图 shot2 修复后：取消/加入陈列两钮完整可见）。
  - **DNA 不破**：只改矮视口下的纵向尺度，材质（毛玻璃奶油弹窗 `--color-popup`+backdrop-blur）、
    陶土红描边、字号（仍 ≥ `--text-label-min` 11px）、圆角/阴影一律不动。仅命中 `max-height:560px`
    （横屏手机），PC 及竖屏高视口不受影响。
  - `overflow-y:auto` 兜底保留（更极端小窗仍可滚动），不删既有安全网。

### 无改动
- 其余 src/ 组件（Workbench/ItemTray/UploadEntry/StoryModal 等）与 tokens.css 未动。上传管线、状态机、
  持久化逻辑无联调缺陷（双视口 e2e 全绿佐证）。本轮响应式修复只落在样式层的矮视口分支。

## 视觉 DNA 人工核验（844×390，逐界面对照 taste/design.md v2）
用临时截图 spec 在 844×390 截取 6 个关键界面（核验后已删，未入交付/回归），逐一对照通过：

- **shot1 dock+上传入口**：暖奶油纸底 ✓；品牌章「念念·陈列室 / MEMORY GALLERY」衬线+玻璃浮块 ✓；
  模式开关「编辑|游客」陶土红激活段反白 ✓；隐藏界面眼睛钮 ✓；dock 玻璃浮块内「物件库」分区标题、
  **「已传 0/50」配额**（沉静灰褐 sans、字号守下限）、**「＋ 上传物件」入口**（陶土红虚线卡）✓；
  底部居中玻璃场景条 ✓；无横向溢出。
- **shot2 上传预览弹窗**：满屏 scrim（压暗+backdrop-blur 透出背后房间）✓；**奶油半透明弹窗**+陶土红
  描边+float 阴影 ✓；「新物件·预览」陶土红 kicker ✓；预览图 contain 居中（绿矩形=判定护栏内的裸矩形
  原图，不据此判失败）✓；「名字」标签+衬线名字输入「外婆的青花瓷碗」✓；元信息「480×360px·宽高比 1.33」✓；
  **修复后**「取消」（ghost）+「加入陈列」（陶土红填充反白）操作区完整可见、无需滚动 ✓。
- **shot3 入库后**：配额实时更新为**「已传 1/50」**✓；dock 15 件、末位为上传件（带用户件删除入口）✓；
  收合把手（chevron）纵向居中、不挤偏面板内容 ✓。
- **shot4 摆放+选中**：场景自适应层铺满视口（客厅图 contain 居中+同图模糊补边）✓；上传件摆在沙发上；
  选中态 = 陶土红细选框 + 四角白圆点手柄 + 选框下方旋转圆钮 + 悬于选框上方的**毛玻璃小工具条**
  （✎故事 / 🗑删除，真 SVG 图标）✓；场景 chip「客厅」陶土红激活+×删除次级入口+「＋新场景」✓。
- **shot5 故事编辑弹窗**：窄屏贴底近满宽 ✓；奶油半透明+backdrop-blur（透出模糊房间）✓；「它的故事」
  陶土红 kicker、衬线标题、meta「陈列于『客厅』」、衬线正文输入（陶土红聚焦框）、陶土红虚线分隔+
  「原始照片」缩略 ✓。
- **shot6 游客只读故事**：同款贴底奶油弹窗，只读态（无输入/保存/取消）；故事正文+原图（绿矩形）✓；
  顶部模式开关「游客」激活 ✓。

结论：新增上传界面元素与既有摆放/故事界面在横屏手机下均守「旧信·沉浸」DNA（暖奶油纸底、衬线展示字、
陶土红唯一强调、毛玻璃浮层、奶油半透明弹窗、UI 字号 ≥ 下限、不对称 dock 把手做视觉居中补偿）。

## 自检：两条验收命令实际运行结果（真实跑过）
- `npx playwright test e2e/u4-full.spec.ts --reporter=line`
  → **exit 0**，`2 passed (5.3s)`：
  - `U4 全流程主链路 @PC1920 …` passed
  - `U4 全流程主链路 @横屏手机844×390 …` passed
- `npx playwright test --reporter=line`（全量回归）
  → **exit 0**，`57 passed (52.3s)`（workers=1、retries=0；m1~m4 / n1~n4 / u1~u4 全绿，无回归）。
- 附加 sanity：`npm run build`（tsc -b + vite build）→ **exit 0**，`✓ built`（CSS 改动不破生产构建）。
- CSS 修复前后各跑一遍 u4-full 双视口均 2 passed；修复只命中矮视口分支，u2/u3 上传相关 spec（默认 PC
  视口）不受影响、全绿。

## 结论
两条验收命令均 exit 0；u4-full 覆盖 U4 全部上传/摆放/故事/游客硬指标于 PC + 横屏手机双视口；就地修复
横屏手机上传预览弹窗操作区落于滚动线以下的响应式缺陷（DNA 不破）；6 界面视觉人工核验守「旧信·沉浸」
DNA；全量 57 e2e 绿、不回归。过不过由评审员对照验收标准裁决。
