# receipt-builder · M1-S1

Sprint 契约（M1-S1.json goal）：搭起 Vite+React+TS 工程骨架（可生产构建、可本地启动），
落地 Scene/Item/Placement 数据模型与带 schema 版本号的 LocalStorage 全量持久化，
并将内置素材（3 张背景、14 件物件）打包为静态资源清单供后续块调用。

> 说明：M1 里程碑整体还包含应用外壳（报头/模式开关/场景条/物件抽屉/画布）与
> playwright e2e（m1-shell.spec.ts）。那些是 M1 里程碑级验收、属后续 sprint，
> **不在 M1-S1 契约内**。本 sprint 只交付地基三件套（工程骨架 + 数据模型/持久化 + 素材清单），
> 未越界去做外壳交互，也未写 e2e。

---

## 一、改动清单（全部落在 .opc/ 之外）

工程配置：
- `package.json` —— 定义 dev/build/preview 脚本；deps: react/react-dom 19；devDeps: vite 7、@vitejs/plugin-react 5、typescript 5.9、@types/react(-dom)。
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` —— Vite react-ts 标准 project references，strict + noUnusedLocals/Parameters + bundler 解析。
- `vite.config.ts` —— react 插件；注明内置素材以相对路径 import、构建时打包进 dist/assets。
- `index.html` —— 入口，挂 `#root` + `/src/main.tsx`，`lang=zh-CN`，title「念念 · 陈列室」。
- `.gitignore` —— 追加 node_modules/ dist/ 等（保留原有 `.opc/artifacts/`）。

源码：
- `src/model/types.ts` —— **数据模型**。`Scene{id,name,backgroundId}`、`Item{id,name,imageSrc,story}`、
  `Placement{id,sceneId,itemId,x,y,scale,rotation,z}`；`Mode='edit'|'guest'`；
  `GalleryState{schemaVersion,scenes,items,placements,activeSceneId,mode}`（全量状态载体）。
  注释写明多对多经 Placement、故事挂 Item。
- `src/assets/manifest.ts` —— **内置素材清单**。以相对路径 `../../backgrounds/*` `../../items/*` import
  3 背景 + 14 物件（素材本体不移动/改名）。导出 `BACKGROUNDS`（id: reading-nook/living-room/bedroom，
  各含 id/name/imageSrc/thumbSrc）与 `ITEMS`（14 件，各含 id/name/imageSrc/thumbSrc），
  另导出 `MAX_SCENES`（=背景数=3）与按 id 取素材的辅助函数。
- `src/storage/persistence.ts` —— **LocalStorage 全量持久化**。`SCHEMA_VERSION=1`、`STORAGE_KEY`；
  `saveState` 每次序列化整棵状态树一次性写入（非增量）；`loadState` 全量读回，
  读不到/解析失败/schema 版本不匹配 → 回退初始状态（迁移接入点已留）；
  `createInitialState`/`createInitialItems`（由素材清单派生 14 件 Item，story 初始空串）、`clearState`。
- `src/App.tsx` + `src/App.css` —— M1-S1「地基就绪」自检面板（只读）：挂载 `loadState`、
  effect 内 `saveState` 全量写回；展示背景/物件/场景/摆放计数、schema 版本，
  并渲染 3 背景 + 14 物件缩略网格（验证素材清单打包可用）。**非完整外壳**。
- `src/main.tsx` —— React 19 StrictMode 挂载。
- `src/index.css` + `src/styles/tokens.css` —— tokens.css 为阶段一锁定 tokens 的**工程副本**
  （源 `.opc/phase1/taste/examples/tokens.css`，逐字复制，供后续视觉 sprint 直接用；
  未引用 .opc 内文件，避免构建依赖禁区）；index.css 用 tokens 做暖奶油纸底 + 深褐 ink + 衬线基线。
- `src/vite-env.d.ts` —— vite/client 类型引用（图片 import 的类型来源）。

## 二、逐条自检（对照 M1-S1 验收硬指标）

1. **`npm run build` 生产构建成功、无类型错误、exit 0** —— 过。
   - 首跑因 `noUnusedLocals` 报 App.tsx 未用的 setState（TS6133），已改为 `const [state] = useState(...)`（本 sprint 面板只读）。
   - 复跑：`tsc -b && vite build` 输出 `✓ built in 321ms`，`=== EXIT: 0 ===`。
   - 产物 `dist/assets` 打包 **17** 个素材：3 张 `*.jpg`（背景）+ 14 张 `*.png`（物件），均带内容哈希。

2. **数据模型字段** —— 过。types.ts 中三型字段与验收字面逐一对齐；
   多对多经 Placement（Placement 同时持 sceneId + itemId）；故事字段 `story` 挂在 Item 上。

3. **LocalStorage 持久化带 schema 版本号、全量读写（非增量）** —— 过。
   `SCHEMA_VERSION=1` 写入 payload；`saveState` 全量 `JSON.stringify(整棵 state)` 一次写；
   `loadState` 全量读回并按版本校验；无任何字段级/增量写路径。

4. **内置素材清单枚举 3 背景 + 14 物件，含 id/名称/缩略/imageSrc** —— 过。
   - 背景 id：`reading-nook`(书房)/`living-room`(客厅)/`bedroom`(卧室)，与 idea 对齐、可直接映射 `Scene.backgroundId`。
   - 物件 14 件：bedroom-1..6 + living-1..8，逐一按图起名（全家福旧照/旧时书信/复古毡帽/旅行背包/
     泛黄旧书/复古闹钟/相机镜头/荣誉奖杯/老式收音机/黄色甲壳虫/潮玩公仔/旧地球仪/掌上游戏机/一杯咖啡）——
     名字经接触表看图确认，非占位。
   - 每条含 id/name/imageSrc/**thumbSrc（缩略字段）**。当前无独立缩略图素材，缩略复用原图
     （透明抠图/背景图本身即可作缩略）；字段已就位，后续如出缩略图仅需替换 thumbSrc 来源。

5. **可本地启动** —— 过。`npm run dev` Vite ready（92ms），curl `/` 与 `/src/main.tsx` 均 HTTP 200，
   返回的 HTML 含 `#root` 与 react-refresh 注入，确认本地服务器可跑。

## 三、字段命名与后续视觉块的对齐

- 背景 id 用 `reading-nook/living-room/bedroom`，与 design.md 场景 chip「客厅/书房/卧室」一一对应。
- tokens.css 已带进 `src/styles/`（工程副本），后续外壳/视觉 sprint 直接引用同名变量，无需再对表。
- `MAX_SCENES`（=3）、`Scene.backgroundId`、`Placement.z` 等命名为 B4（场景上限/背景不可重复）、
  B3（层级）预留，语义与 idea 切块描述一致。

## 四、未做（明确划界，非遗漏）

- 应用外壳交互（建/切/删场景、抽屉拖入、画布变换手柄、故事弹窗、双模式）→ M1 后续 sprint。
- playwright e2e（m1-shell.spec.ts 等）→ M1 里程碑级验收，后续 sprint 引入。
- 独立缩略图素材 → 无来源，thumbSrc 暂复用原图。

## 五、自评

自检对照验收硬指标逐条可对上：build exit 0、字段吻合、持久化带版本且全量、素材清单 3+14 齐备含四类元数据。
过不过以评审为准。
