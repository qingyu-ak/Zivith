'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  APP_VERSION,
  buildBugReportTemplate,
  FEEDBACK_CHANNELS,
} from '@/lib/help-feedback';

type HelpSection = 'docs' | 'feedback';

const NAV: Array<{ id: HelpSection; label: string }> = [
  { id: 'docs', label: '帮助' },
  { id: 'feedback', label: '反馈' },
];

export default function HelpPage() {
  const [section, setSection] = useState<HelpSection>('docs');

  useEffect(() => {
    const hash = window.location.hash.slice(1) as HelpSection;
    if (NAV.some((item) => item.id === hash)) setSection(hash);
  }, []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-5 sm:flex-row sm:p-8">
      <aside className="w-full shrink-0 sm:w-48">
        <h1 className="text-lg font-semibold text-zinc-900">帮助与反馈</h1>
        <nav className="mt-4 grid gap-0.5" aria-label="帮助与反馈分组">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? 'page' : undefined}
              className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition ${
                section === item.id
                  ? 'bg-zinc-100 font-medium text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">
        {section === 'docs' ? <HelpDocs /> : <Feedback />}
      </section>
    </div>
  );
}

/** 帮助：Zivith 使用文档与注意事项（与产品实际能力一一对应，无占位功能）。 */
function HelpDocs() {
  return (
    <div className="grid gap-6">
      <DocsCard title="快速上手">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            在 <b>对话</b> 里描述你想创造的世界，例如「我想创造一个东方玄幻世界」。
          </li>
          <li>
            世界构建者会给出<b>提案</b>（新建项目 / 角色 / 地点 / 事件等）。默认每步确认后写入；也可在输入条切换半自动、计划模式或完全访问。
          </li>
          <li>
            左侧活动栏进入<b>世界</b>工作区：时间线、实体（角色/地点/事件）、资产、记忆都在这里。
          </li>
          <li>
            「实体」页可管理角色卡与资产，「故事」「制作」负责章节与生成流水线。
          </li>
        </ol>
      </DocsCard>

      <DocsCard title="对话与模型">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            输入条可切换<b>写入模式</b>（每步确认 / 半自动 / 计划 / 完全访问）、<b>模型</b>与<b>努力程度</b>（最低 / 均衡 / 最高，影响上下文预算与检查范围）。
          </li>
          <li>
            在 <b>设置 → 模型设置</b> 配置供应商密钥、自定义 OpenAI 兼容端点、模型列表；并用开关控制哪些模型出现在选择器里。
          </li>
          <li>未配置密钥时对话走本地 Mock（内容为占位，界面会显示降级提示）。</li>
          <li>供应商与密钥保存在本机 API 进程内，重启 API 后恢复为环境变量默认。</li>
        </ul>
      </DocsCard>

      <DocsCard title="接入 WeClone 数字分身（可选）">
        <p>
          <a
            href="https://github.com/xming521/WeClone"
            target="_blank"
            rel="noreferrer"
            className="text-[#4d6bfe] hover:underline"
          >
            WeClone
          </a>{' '}
          是独立的开源项目：用聊天记录 LoRA 微调出「数字分身」，再以 OpenAI 兼容 API 对外服务。它在本机独立运行，可以作为 Zivith 的自定义供应商接入对话与扮演。
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            按 WeClone 文档导出聊天记录并完成训练：
            <code className="mx-0.5 rounded bg-zinc-100 px-1">weclone-cli make-dataset</code>
            →{' '}
            <code className="mx-0.5 rounded bg-zinc-100 px-1">weclone-cli train-sft</code>。
          </li>
          <li>
            本机启动服务：
            <code className="mx-0.5 rounded bg-zinc-100 px-1">weclone-cli server</code>
            ，默认地址{' '}
            <code className="mx-0.5 rounded bg-zinc-100 px-1">http://127.0.0.1:8005/v1</code>。
          </li>
          <li>
            在 Zivith 的 <b>设置 → 模型设置 → 添加供应商</b>：名称随意（如「WeClone 分身」），Base
            URL 填上面的地址，API Key 任意（服务不校验），格式 OpenAI Chat，模型添加{' '}
            <code className="rounded bg-zinc-100 px-1">gpt-3.5-turbo</code>
            （WeClone 忽略模型名，只会用你训好的分身回答）。
          </li>
          <li>在对话的模型菜单切到该模型即可；扮演线程同样可在「与此角色对话」前切换选用。</li>
        </ol>
        <p className="mt-2 text-zinc-500">
          注意：分身的说话风格来自微调，Zivith 的记忆系统照常生效；WeClone 为 AGPL-3.0
          独立进程，与本产品无代码耦合；分身回复系 AI 生成，请勿用于冒充真人。
        </p>
      </DocsCard>

      <DocsCard title="记忆系统">
        <ul className="list-disc space-y-1 pl-5">
          <li>对话中的事实会自动归档为记忆（L1 原子，按实体聚合成 L2 核心块）。</li>
          <li>与已有设定矛盾的内容<b>不会自动写入</b>：对话里会出现冲突确认卡，由你选择保留新卡还是已有卡。</li>
          <li>
            选中角色后，在右侧属性的「全书档案」里查看和修改；下方记忆面板也可编辑 L2。展开核心块可溯源到原句。
          </li>
        </ul>
      </DocsCard>

      <DocsCard title="扮演与桌面版">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            侧栏「角色」Tab 或实体页的「与此角色对话」可开始<b>扮演</b>；可选时间锚点与「你是谁」（读者 / 已有角色 / 新建自己）。
          </li>
          <li>
            桌面版（Windows 一键启动）需要本机 Docker；打开文件夹会把世界绑定到该目录，生成{' '}
            <code className="rounded bg-zinc-100 px-1">.zivith/workspace.json</code> 标记。
          </li>
          <li>文件夹移动或改盘符后重新打开，仍会识别为同一个世界（靠标记重绑）。</li>
        </ul>
      </DocsCard>

      <DocsCard title="接入 VoiceStudio 本地配音（可选）">
        <p>
          <a
            href="https://github.com/debpalash/VoiceStudio"
            target="_blank"
            rel="noreferrer"
            className="text-[#4d6bfe] hover:underline"
          >
            VoiceStudio
          </a>{' '}
          是全本地运行的开源语音套件（ElevenLabs 替代）：语音克隆、语音设计、配音、转录，内置 16
          个 TTS 引擎，并暴露 OpenAI 兼容的配音接口。Zivith
          的配音槽走同款协议，可把制作线的配音从云端 TTS 换成本地引擎，离线、零调用费。
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            安装并启动 VoiceStudio（桌面安装包，或 Docker：
            <code className="mx-0.5 rounded bg-zinc-100 px-1">
              docker run -d -p 127.0.0.1:3900:3900 palashdeb/omnivoice-studio:stable
            </code>
            ），在其设置里选好 TTS 引擎（NVIDIA 8GB+ 建议 OmniVoice / CosyVoice 3；低配用
            PocketTTS / Moonshine）。
          </li>
          <li>
            查引擎 ID：访问{' '}
            <code className="mx-0.5 rounded bg-zinc-100 px-1">
              http://127.0.0.1:3900/v1/audio/voices
            </code>
            ，或直接用 VoiceStudio 的模型目录（示例用 <code className="rounded bg-zinc-100 px-1">tts-1</code>）。
          </li>
          <li>
            在 Zivith 的 <b>设置 → 模型设置 → SiliconFlow</b>：Base URL 改为{' '}
            <code className="mx-0.5 rounded bg-zinc-100 px-1">http://127.0.0.1:3900/v1</code>
            ，API Key 随意（如 <code className="rounded bg-zinc-100 px-1">local</code>）后保存；再到
            <b> 语音槽位</b>把模型名改成上面的引擎 ID，保存媒体槽位。
          </li>
          <li>
            在制作线点一次语音生成验证；若报「音色不存在」，在 VoiceStudio
            里建一个 ID 为 <code className="rounded bg-zinc-100 px-1">alloy</code>{' '}
            的音色档（Zivith 未指定音色时的默认名）。
          </li>
        </ol>
        <p className="mt-2 text-zinc-500">
          注意：① SiliconFlow 的配音、图像、视频共用同一 Base
          URL，指向 VoiceStudio 后图像/视频生成会失效——用完改回即可；干净的方案是给音频单独开供应商槽，已在计划。②
          权重许可分层：默认 OmniVoice 权重 CC-BY-NC 禁商用，商用请换 Apache/MIT 引擎（如
          GPT-SoVITS）。③ 克隆声音须获得本人同意；生成语音默认嵌 AudioSeal 水印。
        </p>
      </DocsCard>

      <DocsCard title="注意事项" accent>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>写入模式可切换</b>：默认每步确认；半自动会写入常规设定、新建世界仍问你；计划模式先出计划再执行；完全访问自动写入世界。删除项目等高危操作始终询问。已写入的提案可在设置 → 修改记录里查看。
          </li>
          <li>API Key 只保存在本机，不会回传到浏览器，也不会随目录导出。</li>
          <li>Chat 与 Studio 界面固定浅色；时间轴操作的手势与「上一步/下一步」导航无关。</li>
          <li>数据库（Postgres）等依赖通过 Docker 运行；删除项目为软删，可在库中恢复。</li>
          <li>设置里的自定义供应商 / 模型开关为进程内配置，重启 API 后恢复默认。</li>
        </ul>
      </DocsCard>
    </div>
  );
}

/** 反馈：故障信息一键复制 + 开发者联系方式。 */
function Feedback() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function copyDiagnostics() {
    setError('');
    const text = buildBugReportTemplate({
      version: APP_VERSION,
      url: typeof window === 'undefined' ? '' : window.location.href,
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError('复制失败：请手动描述问题并附上版本号 ' + APP_VERSION);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">提交 Bug</h2>
        <p className="mt-1 text-sm text-zinc-500">
          点下面的按钮复制故障信息模板，粘贴到 QQ 群并补上复现步骤即可。信息只包含版本、时间、页面地址与浏览器环境，不含你的创作内容。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void copyDiagnostics()}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white transition hover:bg-zinc-800"
          >
            {copied ? '已复制故障信息' : '复制故障信息'}
          </button>
          <span className="text-xs text-zinc-400">当前版本 {APP_VERSION}</span>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-zinc-600">
          <li>复现步骤：做了什么、点到哪里（能稳定复现最好）。</li>
          <li>期望结果与实际结果各一句。</li>
          <li>如果是生成质量问题，附上当时的模型与努力程度。</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">联系开发者</h2>
        <ul className="mt-3 grid gap-2">
          {FEEDBACK_CHANNELS.map((channel) => (
            <li
              key={channel.label}
              className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{channel.label}</p>
                {channel.note ? (
                  <p className="mt-0.5 text-xs text-zinc-500">{channel.note}</p>
                ) : null}
              </div>
              {channel.value ? (
                channel.href ? (
                  <Link
                    href={channel.href}
                    className="shrink-0 text-sm text-[#4d6bfe] hover:underline"
                  >
                    {channel.value}
                  </Link>
                ) : (
                  <span className="shrink-0 font-mono text-sm text-zinc-800">{channel.value}</span>
                )
              ) : (
                <span className="shrink-0 text-xs text-zinc-400">待补充</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-400">
          群号与账号由开发者在 <code className="rounded bg-zinc-100 px-1">lib/help-feedback.ts</code>{' '}
          中维护。
        </p>
      </div>
    </div>
  );
}

function DocsCard({
  title,
  children,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${
        accent ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-200'
      }`}
    >
      <h2 className={`text-sm font-semibold ${accent ? 'text-amber-800' : 'text-zinc-900'}`}>
        {title}
      </h2>
      <div className="mt-2 text-sm leading-6 text-zinc-700">{children}</div>
    </div>
  );
}
