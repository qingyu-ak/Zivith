# Zivith Cosmos — 角色宇宙 & 场景宇宙可视化实验（3D 版）

## 目标

在仓库根目录新建 **`experiments/cosmos/`**（独立 npm 项目，**不加入 pnpm-workspace.yaml、不改 apps/ 任何代码**），全部基于 three.js 的两个 3D 可视化视图，纯只读：

1. **角色宇宙**（3D 星空）：角色 = 发光的星（关系越多星越大越亮），角色关系 = 星座连线（`kind` 决定线色：家人/挚友/宿敌/师徒/同盟…；`direction` 用亮→暗渐变表现方向）。背景多层远景星尘 + 缓慢自转。悬浮星 → 名片（头像、标签、关系列表）；点击星 → 聚焦（镜头飞近、高亮该角色的星座、其余压暗）；支持搜索定位。
2. **场景宇宙**（星球星图 + 地球式球面，两层连续体验）：
   - **星图层**：每个地点 = 一颗星球（星际游戏星图风），大小按场景数、外观按地点特征生成（雪原→冰白、海港→深蓝、王城→金褐…，若地点有 `cover_image` 则直接贴图）。星球之间按故事线 `order` 连出发光的超空间航线（虚线 + 流动光点），场景/地点间关系画成更暗的支线。悬浮星球 → 名片（地点名、场景数、简介）；点击星球 → 镜头连续飞近（Google Earth 式过渡，非硬切）。
   - **星球层**：单颗星球特写，可拖拽旋转、滚轮缩放；场景标记钉在球面上（场景 id 做种子的确定性经纬度散布，避开极点），标记 = 发光信标 + 名牌；点击标记 → 侧卡显示场景详情（标题/概要/心情/天气/时间）。无 `location_id` 的场景归入星图中一颗小行星带"未知之地"。顶部面包屑「星图 / 星球名」+ 返回按钮。

数据映射基于已确认的接口：`GET /api/v1/projects`（项目列表）与 `GET /api/v1/projects/:projectId/resources`（`entities.characters/locations/scenes/relationships/stories`，关系为多态 `source/target_type+id + kind/label/direction`）。

## 文件夹结构

```
experiments/cosmos/
├── package.json            # react 19、three、vite、@vitejs/plugin-react、typescript、@types/three
├── vite.config.ts          # 端口 5175；/zivith-api 代理 → http://127.0.0.1:4000（同源免 CORS、不改 API）
├── tsconfig.json
├── index.html
├── README.md               # 运行方式、如何连 Zivith（从 Studio 的 localStorage 复制 zivith_token）、设计笔记
└── src/
    ├── main.tsx / App.tsx  # 顶栏（角色宇宙 / 场景宇宙 tab + 数据源切换）+ 深色主题 styles.css
    ├── types.ts            # 从 apps/web/lib/types.ts 拷贝所需子集（AssetDTO/SceneDTO/WorldRelationshipDTO/WorldResourcesDTO）
    ├── data/mock-world.ts  # 示例世界「雾港遗事」：12 角色、22+ 关系、5 地点、14 场景、2 故事线
    ├── lib/
    │   ├── api.ts          # listProjects / getResources，Bearer token，401 中文提示重新复制 token
    │   ├── palette.ts      # id→色相哈希、已知关系 kind→线色表、地点关键词→星球配色表
    │   ├── planet-texture.ts # canvas 程序化星球贴图（噪声地形 + 关键词配色，无外部素材；cover_image 可用时优先）
    │   ├── cosmos-model.ts # 资源→星空图模型（过滤非角色端点的关系、度数、自写简化 3D 力导向布局）
    │   ├── map-model.ts    # 资源→星图模型（星球大小/布局种子化、超空间航线路径、球面场景经纬度散布）
    │   └── three-helpers.ts# 共享：辉光贴图、镜头 tween 飞行、3D→屏幕坐标投影
    └── views/
        ├── CharacterCosmos.tsx  # 星点（径向渐变贴图+加色混合）、LineSegments 星座线、星尘、OrbitControls、raycast 悬浮/点击、HTML 投影标签
        ├── SceneCosmos.tsx      # 星图层 + 星球层同场景管理，镜头飞行切换两层，面包屑/返回，标记与侧卡
        └── ConnectPanel.tsx     # 连接 Zivith：API 地址（默认 127.0.0.1:4000）+ token + 项目下拉；示例/真实数据一键切换
```

## 实现步骤

1. **脚手架**：目录、package.json、vite/tsconfig、App 外壳（深色主题、双 tab、示例数据默认加载）
2. **类型 + 示例数据**：types.ts 子集、mock-world.ts（同时作为真实数据形状的参照）
3. **角色宇宙**：cosmos-model → 静态星点渲染 → 力导向布局 → 悬浮/点击/搜索 → 星尘与动效
4. **场景宇宙·星图层**：map-model → 程序化星球（贴图/大气辉光）→ 航线与流光 → 悬浮/点击
5. **场景宇宙·星球层**：球面场景标记散布 → 镜头飞行进入/返回星球 → 拖拽旋转/缩放 → 详情侧卡
6. **连接 Zivith**：vite 代理、api.ts、ConnectPanel、项目选择、加载/空态/错误态
7. **打磨**：配色统一（accent #4d6bfe 系）、动效（星闪烁、航线流光、镜头缓动）、README

## 边界与验证

- 不改 `apps/**`、不动 workspace 配置、不提交 git commit；纯只读可视化，无编辑功能。
- 容错：关系端点缺失/非角色、场景无地点、字段为 null 都要能渲染；星球布局与经纬度全部种子化（同数据同画面）。
- 验证：在 `experiments/cosmos/` 内 `pnpm install && pnpm dev` → 打开 http://localhost:5175，两个视图用示例数据验证交互（重点：星图↔星球镜头过渡是否顺滑）；若 Zivith API 在跑则连真实项目再验一遍。
- 实验目录内不搭测试框架，验证以实际运行 + 截图检查为准。
