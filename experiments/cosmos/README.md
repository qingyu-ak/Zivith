# Zivith Universe / Cosmos · 世界空间浏览器（可视化实验）

> **Universe 是世界之间的导航。Cosmos 是世界内部的空间导航。**
>
> 一个 Bubble = 一个 Project。进入之后，球体只表示天体级空间；地点与场景是同一星球上的 Pin。角色 / 事件 / 分镜是存在于空间中的内容，不是独立星球。

本实验读取与 Studio 相同的 `WorldResourcesDTO`，不维护第二套 Project 数据。Space 树（`parentId` + `type`）目前由地点 / 场景派生；后端若补 `Space` 表，渲染层只需换数据源。

```text
Universe（左右滑星云）
  └── Star System（恒星 + 世界轨道）
        └── Planet Cosmos（一颗世界星球）
              └── Location / City / Region（Pin）
                    └── Scene（标记）
                          ├── Character / Event / Shot（投影）
                          └── 角色轨迹（空间 × 时间）
```

## 运行

```bash
cd experiments/cosmos
npm install     # 用 npm：本机 Node 24 与主仓库 engines(Node 22) 不兼容，且本目录刻意独立于 workspace
npm run dev     # http://127.0.0.1:5175
```

默认先进入 **Universe**：四个示例世界绕中心排列（完整世界「雾港遗事」+ 三个草稿世界）。点击星云进入该项目的 **恒星系**（中心恒星 + 世界轨道）；再点星球切近到地表。URL 加 `?still` 关闭自动旋转。画布按 1080p 像素密度输出。

## 连接真实 Zivith 世界

右上角 **「连接 Zivith」**：API 地址（默认 `127.0.0.1:4000`，走 Vite 代理免跨域）+ token（Studio → DevTools → Local Storage → `zivith_token`）→ 载入项目列表。Universe 气泡会换成真实 Project；点击即加载 `GET /api/v1/world/projects/:id/resources`。

选中地点后可 **在 Studio 编辑**：打开 `http://127.0.0.1:3100/projects/:id/world?select=location&entity=:id`，世界工作区 Inspector 读的就是同一条地点资产。Studio 源地址可用 `localStorage.cosmos_zivith_studio` 覆盖。

## 与 Studio 怎么融合（可持续建设）

不要把 Three.js 搬进 Studio 首页。分三层长，后一层可以替换前一层而不改视觉：

```text
1. 合同    packages/domain/src/space.ts
           SpatialContext + studioWorldHref
           Studio：apps/web/lib/spatial-context.ts
           Cosmos：@zivith/domain/space（经 packages/cosmos/src/lib/zivith-space.ts）

2. 派生    packages/cosmos/src/lib/space-tree.ts
           现有 location / scene → 空间树
           后端若补 Space 表，只换这里

3. 视觉    packages/cosmos/src/views/*
           恒星系 / 星球 / 平面图
           稳定后作为 Studio 世界工作区的「空间」画布（`?view=space`）
```

Studio 顶栏 **世界 | 创作线 | 空间** 互斥切换。空间画布嵌入本目录的恒星系 / 星球视图，选中仍走同一份 `WorldResourcesDTO` 与右侧 Inspector。独立实验（本页 `npm run dev`）继续用 Universe 选项目。

Zivith 三个问题分开答：Cosmos = Where，Timeline = When，Inspector / Entity = Who。Creator Chat 下一刀是把 `spatialContextToPrompt()` 注入回合上下文，不把 3D 塞进对话。

## 空间语义

- **球体**：只给 galaxy / planet 等天体尺度。地点不是第二颗星球。
- **动态层级**：`src/lib/space-tree.ts` 用 `parentId` + `type` 建树。现有数据没有大陆/城市嵌套时，派生为 `planet → location/city/region → scene`。
- **导航**：Zoom / Orbit / Fly To / Back / Breadcrumb（宇宙 / 恒星系 / 世界 / 地点 / 场景）。ESC 逐级返回。
- **Entity**：角色出现在场景、事件绑定 scene_ids、分镜数显示在场景卡；选中角色后画出按故事顺序的空间轨迹。
- **关系**：独立「关系」模式，默认空间模式不画关系线。
- **Agent 上下文**：左上角展示 `SpatialContext`（路径、当前场次、在场角色）。这段文本就是将来注入 Creator Chat 的「这里是哪里」。

## 结构

视图、数据合同与派生模型住在工作区包 `packages/cosmos`（`@zivith/cosmos`），Studio 的 `?view=space` 与本预览壳共用同一份源码；本目录只剩 vite 壳（`src/App.tsx`、`src/main.tsx`、`src/page.css`），通过 `vite.config.ts` 的路径别名引用该包。

```
packages/cosmos/src/
├── index.ts                 # 包出口
├── styles.css               # 视图样式（@zivith/cosmos/styles.css）
├── types.ts                 # WorldResourcesDTO 子集（与 Studio 对齐）
├── data/mock-world.ts       # 「雾港遗事」完整示例
├── data/mock-universe.ts    # Universe 气泡（= Project 入口）
├── lib/
│   ├── space-tree.ts        # ★ Space 模型：parentId / type / 路径
│   ├── spatial-context.ts   # ★ Agent 可消费的空间上下文
│   ├── space-model.ts       # 球面坐标、实体投影、角色轨迹
│   ├── cosmos-model.ts      # 关系模式：角色星空
│   ├── planet-texture.ts
│   ├── starfield.ts         # 烘焙星图天空球
│   └── three-helpers.ts     # 1080p DPR / 相机 tween
└── views/
    ├── UniverseView.tsx     # ★ 项目星云层
    ├── SystemView.tsx       # ★ 恒星 + 地球轨道
    ├── SpaceCosmos.tsx      # 世界内部空间
    ├── CharacterCosmos.tsx  # 关系辅助模式
    └── ConnectPanel.tsx
```

## 刻意不做（MVP）

不加 Prisma Space 表、不做 GIS / 真实星图 / 游戏级地形。不把 Three.js 挂到 Studio 首页，只作为世界工作区的可选画布。Agent 修改世界、Chat 注入、Shot Pro 上下文留在主产品接线。

## 验收对照

- Universe：一个 Bubble = 一个 Project；可旋转；当前焦点明确；点击进入；不另存项目数据
- Star System：中心恒星 + 同心轨道 + 世界星球公转；点击切近进入地表
- Cosmos：Root Space + parent/child；Zoom / Orbit / Fly To / Back / Breadcrumb
- Planet：多个 Location 同属一颗星球；点击飞入；可再进入 Scene
- Entity 不是 Space；轨迹表达「谁 · 什么时候 · 在哪里」
- Agent 能读到当前空间路径（HUD 中的 SpatialContext）
