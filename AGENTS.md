# Agent 入口

Zivith 有两部宪章。先读产品宪法，再碰代码。

1. **产品宪法**（做什么、如何验收、如何执行任务）  
   [`docs/product/Product-Constitution.md`](docs/product/Product-Constitution.md)
2. **架构宪章**（世界如何被系统表示、ADR）  
   [`docs/architecture/architecture-principles.md`](docs/architecture/architecture-principles.md)
3. 实现约定  
   [`docs/engineering/Code-Agent-Design-Guide.md`](docs/engineering/Code-Agent-Design-Guide.md)

写代码前必须填写产品宪法 §25 模板，并经确认。不要从功能清单开工。总任务书未再次启用前不要按其 P0 顺序插队。

文档冲突以产品宪法为准。用户说的「世界」等于 `Project`，不要新建 `World` 表。扮演「不反写世界」已不再是完成定义；目标是提议 → 确认 → 写入。术语映射见产品宪法「立宪裁决」。
