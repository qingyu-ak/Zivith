/**
 * 帮助与反馈页（/help）的数据与纯工具。
 * 联系方式集中在 FEEDBACK_CHANNELS：开发者拿到真实群号/账号后只改这里。
 */

/** 与根 package.json version 对齐。 */
export const APP_VERSION = '0.1.0-pre';

export interface FeedbackChannel {
  label: string;
  /** 空字符串表示尚未开通，界面显示「待补充」而不是假链接。 */
  value: string;
  /** 可选的直达链接（群号/主页等）。 */
  href?: string;
  note?: string;
}

export const FEEDBACK_CHANNELS: FeedbackChannel[] = [
  {
    label: '开发者 QQ 群',
    value: '',
    note: '入群请备注「Zivith」，并附上故障信息。',
  },
  {
    label: 'Bilibili',
    value: '',
  },
  {
    label: '小红书',
    value: '',
  },
  {
    label: '邮箱',
    value: '',
  },
];

export interface BugReportInput {
  version: string;
  url: string;
  userAgent: string;
  time?: Date;
  /** 用户补充的复现步骤/期望/实际（可空，留占位）。 */
  steps?: string;
  expected?: string;
  actual?: string;
}

/** 生成贴给开发者的故障报告文本（反馈页「复制故障信息」用）。 */
export function buildBugReportTemplate(input: BugReportInput): string {
  const time = (input.time ?? new Date()).toISOString();
  return [
    '【Zivith 故障反馈】',
    `版本：${input.version}`,
    `时间：${time}`,
    `页面：${input.url}`,
    `环境：${input.userAgent}`,
    '',
    '复现步骤：',
    input.steps?.trim() || '1. ',
    '',
    '期望结果：',
    input.expected?.trim() || '',
    '实际结果：',
    input.actual?.trim() || '',
  ].join('\n');
}
