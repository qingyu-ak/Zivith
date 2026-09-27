# Chat 模型与思考档位选择器

> Status: Implemented — 2026-09-27，分支 `feat/chat-meteor-thinking`
>
> 版本：V1.0
>
> 所属：Journey C，项目 Chat 输入区
>
> 与 [产品宪法](../product/Product-Constitution.md) 冲突处以宪法为准。服务端努力程度仍是 `fast | balanced | deep`（`chat-v1`），见 [Agent Effort Control RFC](../architecture/rfc/Agent-Effort-Control-RFC.md)。

---

## 1. 做什么

Chat 输入区右侧一个控件，同时选模型和思考档位。底栏显示 `模型名 档位`。点开后：

```text
[⚡]              档位名              [深度思考]
              模型名 >
        ○────────●────────○
```

- **⚡ 快速**：始终有。关着是黑色空心闪电，打开变成蓝色。只加快流星，不改发给服务端的努力程度。
- **深度思考**：当前模型支持思维链才出现。打开后胶囊底色轻轻晕动，流星更亮。开关存在本机，这一轮请求还不带思维链参数。
- **上下文**：当前模型有多于一种窗口才出现。现在的目录里没有这种模型，所以不显示。
- **滑杆**：按模型 3、4 或 5 档。圆点标出停点。第一档左边是完整圆头，没有缺口。

模型列表仍是原来的搜索和「管理模型」。

## 2. 档位

| 模型 | 档数 | 名称 |
|---|---|---|
| 普通模型，如 `deepseek-chat`、`mock-text-v1`、未识别 id | 3 | 快速 / 均衡 / 深度 |
| 支持思维链，如 `deepseek-v4-flash` | 4 | 快速 / 均衡 / 高 / 深度 |
| 名称含 pro、reasoner、r1，如 `deepseek-v4-pro` | 5 | 快速 / 均衡 / 高 / 极深 / 最深 |

每一档映射到已有的 `ChatEffort`，不新增服务端级别：

| 档数 | 从左到右 |
|---|---|
| 3 | fast，balanced，deep |
| 4 | fast，balanced，deep，deep |
| 5 | fast，balanced，balanced，deep，deep |

上下文预算仍是 8k / 24k / 40k。靠右但映射到同一个 `deep` 的档，差别在流星和提示，不在请求预算。

停点存在 `localStorage` 键 `zivith.chatEffortStop`。换模型后如果停点超出新档数，收到最后一档。

## 3. 最高档

只有最后一档有流星。流星从胶囊上沿外面进入，沿 Logo 的 48° 斜度把轨道划完，再离开。多颗一起飞，明暗不同，拖尾有长有短。拖尾在亮点后面，头部亮、尾端变淡。飞行先轻轻加速，再减速。其中一颗可以轻轻弯一下。

飞行范围收在轨道上沿外面一点点，不划过模型名。

拉到最高档时：

1. 「最深」或「深度」让开，同一行显示「这一档会更快的消耗词元」。
2. 一道光从左向右划过这行字。
3. 模型名在提示期间不显示，高度留着，选择框不变形。
4. 约 1.5 秒后，档位名和模型名回来。轨道上的圆点在最高档隐藏，避免盖住流星。

## 4. 深度思考的晕动

`data-thinking="on"` 时，胶囊填充色在蓝和紫之间慢慢移动，轨道外有一圈很轻的紫晕。`prefers-reduced-motion: reduce` 时这层动画关掉。

## 5. 代码

| 文件 | 作用 |
|---|---|
| `apps/web/components/creator-chat/model-effort-picker.tsx` | 弹层：闪电、深度思考、滑杆、模型列表、最高档提示 |
| `apps/web/components/creator-chat/chat-composer.tsx` | 接在输入区，读写本机档位，把映射后的 effort 交给发送 |
| `apps/web/lib/model-capabilities.ts` | 模型是否有思维链、几档、填充宽度 |
| `apps/web/lib/meteor-motion.ts` | 流星数量、斜度、拖尾、明暗 |
| `apps/web/components/brand/meteor-field.tsx` | 流星点、拖尾、加速减速 |
| `apps/web/app/globals.css` | 胶囊、流星、提示流光、深度思考晕动 |

思考中的状态文案仍在输入框上方（「正在思考…」）。页面加载用的 Spinner 不改。

## 6. 还没做

- 思维链开关还没有写进对话请求。
- 没有模型带多种上下文窗口，所以上下文入口不会出现。
- Extended Deep、错误轨迹、世界创建和世界切换动画不做。
