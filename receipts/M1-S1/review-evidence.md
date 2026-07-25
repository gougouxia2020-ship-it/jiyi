# review-evidence · M1-S1

评审对象：receipts/M1-S1/receipt-builder.md 交付物。
核查范围：仅 M1-S1.json 的 goal 字段中【验收硬指标】段列出的 4 条，不拿 M1 里程碑全量标准（外壳交互、e2e、可本地启动等）来误伤本切片。

---

## 硬指标 1 — `npm run build` 生产构建成功、无类型错误、exit code 0

亲自执行：

```
$ npm run build; echo "=== EXIT: $? ==="

> memories@0.1.0 build
> tsc -b && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 49 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                 0.41 kB │ gzip:  0.30 kB
... (17 张素材资源，见下)
dist/assets/index-C-XZWMzZ.css                  3.29 kB │ gzip:  1.21 kB
dist/assets/index-CAoOsldk.js                 197.96 kB │ gzip: 62.38 kB
✓ built in 333ms
=== EXIT: 0 ===
```

结论：**过**。`tsc -b` 无报错即返回，`vite build` 成功产出 dist，exit code 实测为 0。

附加核对 dist/assets 产物计数：

```
$ ls dist/assets | grep -E '\.(jpg|png)$' | wc -l
17
$ ls dist/assets | grep '\.jpg$'
bedroom-demo-He3QiQOW.jpg
living-room-demo-qbHPvBCH.jpg
reading-nook-demo--skt67Tu.jpg
$ ls dist/assets | grep '\.png$' | wc -l
14
```

3 jpg（背景）+ 14 png（物件）= 17，与回执一致。

---

## 硬指标 2 — 数据模型字段精确对齐

核查文件：`/Users/yuriiiz/Projects/Memories/src/model/types.ts`

- `Scene`（第 10-15 行）：字段为 `id: string; name: string; backgroundId: string;` —— 与验收字面 `Scene{id,name,backgroundId}` 逐一对齐。
- `Item`（第 18-25 行）：字段为 `id: string; name: string; imageSrc: string; story: string;` —— 与验收字面 `Item{id,name,imageSrc,story}` 逐一对齐。**story 字段挂在 Item 上**，注释第 6 行明确写「故事挂在 Item 本身（跨场景同步），而非挂在某次 Placement 上」。
- `Placement`（第 28-42 行）：字段为 `id: string; sceneId: string; itemId: string; x: number; y: number; scale: number; rotation: number; z: number;` —— 与验收字面 `Placement{id,sceneId,itemId,x,y,scale,rotation,z}` 逐一对齐，且**同时持有 sceneId 与 itemId**，构成 Scene↔Item 多对多关系的连接实体（第 27 行注释「摆放 = 某个 Item 在某个 Scene 中的一次落位（多对多的连接实体）」）。
- Placement 结构体中未见 story 字段，确认故事未错挂在摆放记录上。

结论：**过**。三型字段与验收字面精确一致，多对多经 Placement 撮合，story 挂在 Item 而非 Placement。

---

## 硬指标 3 — LocalStorage 持久化带 schema 版本号、全量读写（非增量）

核查文件：`/Users/yuriiiz/Projects/Memories/src/storage/persistence.ts`

- 第 13 行：`export const SCHEMA_VERSION = 1;` —— 版本号存在。
- `saveState`（第 79-87 行）：`const payload: GalleryState = { ...state, schemaVersion: SCHEMA_VERSION }; localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));` —— 每次把整棵 `GalleryState` 序列化后一次性写入，**无字段级/局部 patch 写路径**。
- `loadState`（第 45-76 行）：`localStorage.getItem(STORAGE_KEY)` 整串读回，`JSON.parse` 后**校验 `parsed.schemaVersion !== SCHEMA_VERSION` 则整体回退初始状态**（第 58-61 行），否则重建完整 `GalleryState` 对象（scenes/items/placements/activeSceneId/mode 全字段），不是增量合并写。
- 全文搜索未见任何 `localStorage.setItem` 之外的写入调用，也未见对单个字段做单独存取的代码路径。

结论：**过**。Schema 版本号存在且在读取时校验；saveState/loadState 均为整棵状态树全量读写，无增量路径。

---

## 硬指标 4 — 内置素材清单枚举 3 背景 + 14 物件，含 id/名称/缩略/imageSrc 元数据

核查文件：`/Users/yuriiiz/Projects/Memories/src/assets/manifest.ts`

- `BACKGROUNDS`（第 50-54 行）：3 条，id 分别为 `reading-nook`（书房）、`living-room`（客厅）、`bedroom`（卧室），与验收字面 `reading-nook/living-room/bedroom` 完全一致；每条含 `id/name/imageSrc/thumbSrc` 四个字段。
- `ITEMS`（第 57-72 行）：14 条，id 为 `bedroom-1`..`bedroom-6`（6 件）+ `living-1`..`living-8`（8 件），与验收字面「bedroom-1..6、living-1..8」一致；每条含 `id/name/imageSrc/thumbSrc` 四个字段。
- 注：`thumbSrc` 当前实现为复用 `imageSrc`（无独立缩略图源），字段本身按验收要求存在且非空，回执中已如实注明此点，未隐瞒。判定：验收字面只要求「含...缩略...元数据」（字段存在），未要求缩略图与原图必须是不同文件，故不算硬指标缺项。

结论：**过**。3 背景 + 14 物件枚举齐全，元数据字段（id/name/imageSrc/thumbSrc）逐条具备。

---

## 交叉核对：清单路径 vs 磁盘实际文件

```
$ ls backgrounds/
bedroom-demo.jpg
living-room-demo.jpg
reading-nook-demo.jpg

$ ls items/
bedroom-1.png  bedroom-2.png  bedroom-3.png  bedroom-4.png  bedroom-5.png  bedroom-6.png
living-1.png   living-2.png   living-3.png   living-4.png   living-5.png   living-6.png
living-7.png   living-8.png
```

manifest.ts 中的 import 路径（第 9-27 行）：
```
'../../backgrounds/bedroom-demo.jpg'
'../../backgrounds/living-room-demo.jpg'
'../../backgrounds/reading-nook-demo.jpg'
'../../items/bedroom-1.png' … '../../items/bedroom-6.png'
'../../items/living-1.png' … '../../items/living-8.png'
```

逐一比对：3 个背景文件名与 6+8=14 个物件文件名，与磁盘实际文件**一一精确匹配**，无编造、无拼写错误、无路径偏差。`npm run build` 能成功打包出对应 17 个带哈希资源文件，从构建结果侧再次印证清单路径真实可解析（若路径有误，`vite build`/`tsc` 会因找不到模块而报错退出非 0，但实测 exit 0）。

---

## 补充核实（非本 sprint 硬指标，仅作背景验证）

`npm run dev` 本地启动 + curl 探活（回执有提及，顺手复核，不作为本次通过/打回依据）：

```
$ npm run dev
VITE v7.3.6  ready in 87 ms
Local: http://localhost:5173/

$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5173/
HTTP 200
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5173/src/main.tsx
HTTP 200
```

与回执描述一致。

---

## 总结论

M1-S1.json goal 中【验收硬指标】4 条逐一亲手核查：

1. `npm run build` exit 0、无类型错误 —— 过
2. Scene/Item/Placement 字段精确对齐、多对多经 Placement、story 挂 Item —— 过
3. LocalStorage 全量读写 + schema 版本号 —— 过
4. 素材清单 3 背景 + 14 物件枚举齐全且元数据字段齐备、与磁盘实际文件一致 —— 过

未发现缺项、错误或不达标之处。回执如实披露了 thumbSrc 复用 imageSrc 的实现细节，未见虚报。

**裁决：pass（放行定稿）。**
