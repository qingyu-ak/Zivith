# Zivith Cosmos 空间宇宙重构 —— Agent 实现提示词

> **目标：纠偏当前 Cosmos 的产品语义。**
>
> 当前 Cosmos 已经具备星空、发光球体、空间缩放、节点等视觉基础，但现在最大的方向问题是：**把“场景/实体”错误地表现成了多个独立球体和关系节点。**
>
> 本次任务不是简单美化 UI，而是重新确立 Cosmos 的核心产品模型：
>
> **Cosmos = Zivith 的“世界空间浏览器”，类似 Google Earth + 科幻星图。**
>
> 球体主要代表具有真实空间尺度的“空间容器/天体层级”，而不是普通 Entity。
>
> ---
>
> ## 一、最核心的产品定义
>
> Zivith 中：
>
> **一个 Project 可以理解为一个 Universe / World。**
>
> Cosmos 用空间视角让用户浏览这个世界。
>
> 核心关系：
>
> ```text
> Project
>   ↓
> Universe / World
>   ↓
> Galaxy
>   ↓
> Star System
>   ↓
> Planet
>   ↓
> Continent
>   ↓
> Country / Region
>   ↓
> City
>   ↓
> District
>   ↓
> Location
>   ↓
> Scene
> ```
>
> 但这不是固定层级。
>
> **不同类型的作品应该拥有不同的空间结构。**
>
> 例如：
>
> ### 现实 / 地球题材
>
> ```text
> Earth
>   ↓
> China
>   ↓
> Beijing
>   ↓
> District
>   ↓
> Building
>   ↓
> Room
> ```
>
> ### 奇幻世界
>
> ```text
> World
>   ↓
> Continent
>   ↓
> Kingdom
>   ↓
> City
>   ↓
> Castle
>   ↓
> Room
> ```
>
> ### 星际探索
>
> ```text
> Galaxy
>   ↓
> Star System A
>   ↓
> Planet A
>   ↓
> Colony
>   ↓
> City
>   ↓
> Facility
> ```
>
> ### 多星球世界
>
> ```text
> Galaxy
>   ├── Star System A
>   │     ├── Planet A
>   │     └── Planet B
>   │
>   ├── Star System B
>   │     ├── Planet C
>   │     └── Planet D
>   │
>   └── Star System C
>         └── Planet E
> ```
>
> 用户可以在不同恒星系之间跳转。
>
> ---
>
> # 二、最重要的视觉语义规则
>
> ## 1. 球体 ≠ Entity
>
> 这是本次修改最重要的原则。
>
> **不要再把角色、事件、普通场景、道具等全部渲染成独立球体。**
>
> 错误：
>
> ```text
>        ● 王诚
>       /
>   ● 雾港
>       \
>        ● 事件
> ```
>
> 这种表现会让 Cosmos 看起来像知识图谱 / Entity Graph。
>
> 正确：
>
> ```text
>              🌍 一个星球
>       ┌───────────────────┐
>       │                   │
>       │    ● 北境         │
>       │                   │
>       │             ● 雾港│
>       │                   │
>       │        ● 帝都     │
>       │                   │
>       └───────────────────┘
> ```
>
> **一个星球上的多个地点属于同一个空间。**
>
> 它们应该表现为：
>
> - 地点 Marker
> - Location Pin
> - Scene Marker
> - 区域
> - 城市
> - 路线
> - 边界
> - 地图层
>
> 而不是多个“行星球”。
>
> ---
>
> ## 2. 什么时候才能使用球体？
>
> 只有当对象本身拥有明显独立的空间尺度时，才应该使用球体。
>
> 合理：
>
> ```text
> 银河
>   ↓
> 恒星系
>   ↓
> 行星
>   ↓
> 卫星
> ```
>
> 不合理：
>
> ```text
> 行星
>   ↓
> ● 城市
> ● 城堡
> ● 房间
> ● 王诚
> ● 事件
> ```
>
> 城市、城堡、房间应该是这个行星空间中的地点层级，而不是独立星球。
>
> ---
>
> # 三、Cosmos 应该像 Google Earth 一样工作
>
> 用户进入 Cosmos 后，首先看到的是一个空间。
>
> 用户可以：
>
> - 拖动
> - 缩放
> - 旋转
> - 聚焦
> - 双击进入
> - 返回上一级
> - 在空间层级之间跳转
>
> 例如：
>
> ```text
> Galaxy
>      ↓ zoom
> Star System
>      ↓ zoom
> Planet
>      ↓ zoom
> Continent
>      ↓ zoom
> City
>      ↓ zoom
> Location
>      ↓ zoom
> Scene
> ```
>
> 每一次缩放不是简单的视觉动画，而应该代表：
>
> **进入更具体的空间语义层级。**
>
> ---
>
> # 四、Cosmos 的核心交互
>
> ## 1. Zoom In
>
> 当用户放大一个空间对象：
>
> ```text
> Galaxy
> ```
>
> 逐渐进入：
>
> ```text
> Star System
> ```
>
> 再进入：
>
> ```text
> Planet
> ```
>
> 再进入：
>
> ```text
> Region
> ```
>
> 再进入：
>
> ```text
> City
> ```
>
> 最终进入：
>
> ```text
> Scene
> ```
>
> 要让用户产生：
>
> **“我正在进入这个世界。”**
>
> 而不是：
>
> **“我正在打开一个节点。”**
>
> ---
>
> ## 2. Zoom Out
>
> 从具体场景返回：
>
> ```text
> Scene
>   ↑
> Location
>   ↑
> City
>   ↑
> Region
>   ↑
> Planet
>   ↑
> Star System
>   ↑
> Galaxy
> ```
>
> 用户应该可以随时返回上一级。
>
> 建议保留明显的：
>
> **Breadcrumb / Spatial Path**
>
> 例如：
>
> ```text
> 银河系 / 北境恒星系 / 北境星 / 北境大陆 / 雾港
> ```
>
> 点击任何一级都可以直接跳转。
>
> ---
>
> # 五、普通 Entity 应该如何存在？
>
> Character、Event、Prop、Faction、Shot 等普通实体不能消失。
>
> 但它们不应该和空间对象使用相同的视觉语义。
>
> 正确的模型：
>
> ```text
>                 SPACE
>                   │
>          ┌────────┼────────┐
>          ↓        ↓        ↓
>        Location Location Location
>          │
>          ├── Character
>          ├── Event
>          ├── Prop
>          ├── Shot
>          └── Scene
> ```
>
> **Entity 是“存在于空间中的对象”。**
>
> Space 是“Entity 所处的容器”。
>
> ---
>
> # 六、人物移动应该通过空间 + 时间表达
>
> 例如：
>
> 王诚在第 1 章位于帝都。
>
> 第 7 章前往北境。
>
> 不要仅仅创建：
>
> ```text
> 王诚 ───── 北境
> ```
>
> 而应该表现成：
>
> ```text
> World Space
>
> 帝都
>   │
>   │  王诚
>   │
>   │  第 1 章
>   ↓
> 王诚移动
>   ↓
> 北境
>   │
>   │  王诚
>   │
>   │  第 7 章
> ```
>
> 也就是说：
>
> **Space 决定“在哪里”。**
>
> **Timeline 决定“什么时候”。**
>
> **Entity 决定“谁/什么”。**
>
> 这三个维度共同构成 Zivith 的世界模型。
>
> ---
>
> # 七、Cosmos 与 Timeline 的关系
>
> Zivith 的核心不是单独的 Cosmos。
>
> Cosmos 和 Timeline 应该互补。
>
> ```text
>                  ZIVITH
>                     │
>          ┌──────────┼──────────┐
>          ↓          ↓          ↓
>        SPACE       TIME       ENTITY
>       Cosmos     Timeline     Objects
>          │          │          │
>          └──────────┼──────────┘
>                     ↓
>              Creative Context
> ```
>
> Cosmos 回答：
>
> > **Where？在哪里？**
>
> Timeline 回答：
>
> > **When？什么时候？**
>
> Entity 回答：
>
> > **Who / What？谁 / 什么？**
>
> AI 最终需要读取三者组合后的上下文。
>
> ---
>
> # 八、场景不是 Cosmos 的“球”
>
> Scene 应该是一个真正的空间位置 / 空间单元。
>
> 例如：
>
> ```text
> 🌍 北境星
>    │
>    ├── 北境大陆
>    │     │
>    │     ├── 雾港
>    │     │    ├── 港口
>    │     │    ├── 酒馆
>    │     │    └── 城堡
>    │     │
>    │     └── 北境城
>    │
>    └── 帝都大陆
>          └── 帝都
> ```
>
> 当用户进入“酒馆”：
>
> ```text
> 酒馆
> ```
>
> 此时才显示：
>
> - 当前场景
> - 当前角色
> - 当前事件
> - 当前道具
> - 当前 Shot
> - 场景图片
> - 场景描述
> - 相关时间线状态
>
> Cosmos 负责：
>
> **“我在哪里？”**
>
> 场景详情负责：
>
> **“这里发生什么？”**
>
> ---
>
> # 九、视觉风格继续保留，但语义必须调整
>
> 当前已有的以下视觉元素可以保留：
>
> - 星空背景
> - 发光效果
> - 玻璃 / 半透明 UI
> - 球体
> - 环形光晕
> - 空间纵深
> - 平滑缩放
> - 粒子
> - 柔和的霓虹色
>
> **不要为了纠偏而把 Cosmos 做成普通地图软件。**
>
> 它仍然应该具有：
>
> **“进入一个虚构世界”的感觉。**
>
> 只是视觉隐喻必须从：
>
> ```text
> Entity Graph
> ```
>
> 转变为：
>
> ```text
> Spatial Universe
> ```
>
> ---
>
> # 十、关系线应该降级为辅助信息
>
> 当前版本大量彩色连线容易产生“知识图谱”的感觉。
>
> 不要完全删除关系。
>
> 但是关系线不应该成为 Cosmos 的主视觉。
>
> 默认状态：
>
> ```text
> 空间 > 地点 > 内容
> ```
>
> 而不是：
>
> ```text
> 关系 > 节点 > 空间
> ```
>
> 可以在用户选中某个角色、事件或场景之后：
>
> - 显示相关关系
> - 高亮关联地点
> - 显示人物移动路径
> - 显示事件影响区域
> - 显示相关 Scene
>
> 即：
>
> **Relationship View 是一种辅助模式，而不是 Cosmos 默认模式。**
>
> ---
>
> # 十一、建议加入 Space / Relationship 两种观察模式
>
> 如果当前架构允许，可以设计：
>
> ```text
> [ Space ] [ Relations ]
> ```
>
> ### Space Mode
>
> 默认模式。
>
> 强调：
>
> - 空间
> - 地理位置
> - 星系
> - 行星
> - 城市
> - Scene
> - Zoom
>
> ### Relations Mode
>
> 强调：
>
> - 人物关系
> - 阵营
> - 事件关系
> - Entity 关联
>
> 但两个模式必须共享同一份底层数据。
>
> 不要建立两套互相独立的数据模型。
>
> ---
>
> # 十二、数据模型原则
>
> 如果当前已有 Entity 模型，不要为了视觉重构而大规模推翻后端。
>
> 可以新增明确的空间概念，例如：
>
> ```text
> Space
> SpatialNode
> Location
> Scene
> ```
>
> 推荐语义：
>
> ```text
> Space
> ├── id
> ├── projectId
> ├── parentId
> ├── type
> ├── name
> ├── description
> ├── position
> ├── scale
> └── metadata
> ```
>
> Space.type 可以根据项目需要扩展：
>
> ```text
> universe
> galaxy
> star_system
> star
> planet
> moon
> continent
> region
> country
> city
> district
> location
> scene
> ```
>
> 注意：
>
> **不要强制所有 Project 使用同一套空间层级。**
>
> 空间树应该是动态的。
>
> ---
>
> # 十三、Entity 与 Space 的关系
>
> 推荐：
>
> ```text
> Entity
>    │
>    ├── currentSpaceId
>    └── spatialHistory
> ```
>
> 或者使用独立关系：
>
> ```text
> EntityPlacement
> ```
>
> 用来表达：
>
> ```text
> Character: 王诚
> Space: 北境城
> Time: Chapter 7
> ```
>
> 这样未来就可以自然支持：
>
> - 人物移动
> - 道具移动
> - 事件地点
> - Shot 地点
> - 场景历史
> - 时间旅行
> - 平行世界
> - 多时间线
>
> ---
>
> # 十四、不要过度实现
>
> 当前目标不是制作完整 Google Earth。
>
> **不要现在实现：**
>
> - 真实卫星地图
> - GIS
> - 地理坐标系统
> - 复杂 3D 地形
> - 真实星系物理模拟
> - 精确天文学数据
> - 游戏引擎级别地图
> - 大型地图编辑器
>
> 当前只需要实现：
>
> **“空间层级 + 可视化浏览 + 缩放 + 跳转 + 地点 + Entity 投影”**
>
> ---
>
> # 十五、MVP 应该达到的体验
>
> 请优先实现下面这个完整闭环：
>
> ```text
> 打开 Project
>       ↓
> 进入 Cosmos
>       ↓
> 看到一个 World
>       ↓
> 放大
>       ↓
> 看到多个区域 / 城市
>       ↓
> 继续放大
>       ↓
> 看到 Scene / Location
>       ↓
> 点击 Scene
>       ↓
> 右侧显示 Scene 信息
>       ↓
> 显示当前处于这里的 Character / Event / Shot
>       ↓
> 点击 Character
>       ↓
> 查看角色信息
>       ↓
> 查看角色在 Timeline 上的空间移动
> ```
>
> 这才是第一阶段真正需要验证的产品闭环。
>
> ---
>
> # 十六、验收标准
>
> 完成后，请逐项检查：
>
> ### 空间语义
>
> - [ ] 一个世界不会因为存在多个 Scene 而被拆成多个球体
> - [ ] 一个星球上的多个地点属于同一个空间
> - [ ] 球体主要表示行星 / 恒星系 / 银河等空间尺度
> - [ ] City / Location / Scene 使用地点语义
> - [ ] Character / Event / Prop 不再与 Planet 使用相同视觉语义
>
> ### 导航
>
> - [ ] 支持 Zoom In
> - [ ] 支持 Zoom Out
> - [ ] 支持进入空间
> - [ ] 支持返回上一级
> - [ ] 支持 Breadcrumb
> - [ ] 支持空间之间跳转
>
> ### Entity
>
> - [ ] Entity 可以绑定到 Space
> - [ ] Character 可以出现在具体 Location / Scene
> - [ ] Event 可以拥有发生地点
> - [ ] Shot 可以绑定 Scene
> - [ ] Entity 不会污染空间层级
>
> ### Timeline
>
> - [ ] Entity 的空间位置可以随时间变化
> - [ ] 能表达“某角色什么时候在哪里”
> - [ ] Cosmos 与 Timeline 使用同一世界数据
>
> ### UI
>
> - [ ] 保留当前星空宇宙感
> - [ ] 减少默认状态下的大量关系线
> - [ ] 不要让 UI 看起来像知识图谱
> - [ ] 空间层级是第一视觉重点
> - [ ] 地点和 Scene 是第二视觉重点
> - [ ] Entity / Relationship 是辅助信息
>
> ---
>
> # 十七、实现原则
>
> **不要先改代码。**
>
> 第一步：
>
> 先检查当前 Cosmos 的：
>
> - 数据结构
> - Space / Scene / Entity 定义
> - 节点渲染逻辑
> - 球体生成逻辑
> - 连线逻辑
> - Zoom / Camera
> - 点击交互
> - 右侧详情面板
>
> 第二步：
>
> 输出当前实现与上述产品模型之间的差异。
>
> 第三步：
>
> 给出最小改造方案。
>
> 第四步：
>
> 优先修改**语义模型和渲染层**，避免无必要的大规模重构。
>
> 第五步：
>
> 完成 MVP 后自行运行项目进行验证。
>
> **不要因为当前视觉效果已经很好看，就继续堆粒子、光效和球体。**
>
> 本次任务的重点是：
>
> > **让“漂亮的宇宙”真正成为“可进入、可缩放、可探索的世界空间”。**
>
> ---
>
> # 最终产品定义
>
> 请始终牢记这一句话：
>
> > **Zivith Cosmos 不是把世界拆成很多球，而是让用户像探索 Google Earth 一样探索自己的世界。**
>
> 一个 Project 是一个世界。
>
> 一个世界可以是一颗地球，也可以是一颗奇幻星球，也可以是一整个星系，甚至是一片银河。
>
> 用户可以从宏观宇宙一路进入具体 Scene。
>
> **球体代表空间，地点代表位置，Entity 代表存在于空间中的内容，Timeline 代表这些内容在时间中的变化。**
>
> 这四者共同构成 Zivith 的世界模型。
