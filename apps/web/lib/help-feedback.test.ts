import { describe, expect, it } from 'vitest';
import { buildBugReportTemplate, FEEDBACK_CHANNELS } from './help-feedback';

describe('buildBugReportTemplate', () => {
  it('包含版本、时间、页面、环境与三个留白段', () => {
    const time = new Date('2026-09-06T02:00:00.000Z');
    const text = buildBugReportTemplate({
      version: '0.1.0-pre',
      url: 'http://127.0.0.1:3000/projects/p1/world',
      userAgent: 'Mozilla/5.0 Test',
      time,
    });
    expect(text).toContain('【Zivith 故障反馈】');
    expect(text).toContain('版本：0.1.0-pre');
    expect(text).toContain('时间：2026-09-06T02:00:00.000Z');
    expect(text).toContain('页面：http://127.0.0.1:3000/projects/p1/world');
    expect(text).toContain('环境：Mozilla/5.0 Test');
    expect(text).toContain('复现步骤：\n1. ');
    expect(text).toContain('期望结果：\n\n实际结果：');
  });

  it('用户填写的内容覆盖默认占位', () => {
    const text = buildBugReportTemplate({
      version: '0.1.0-pre',
      url: '/help',
      userAgent: 'ua',
      steps: '1. 打开设置\n2. 点击模型开关',
      expected: '开关保持开启',
      actual: '刷新后回到开启前状态',
    });
    expect(text).toContain('1. 打开设置\n2. 点击模型开关');
    expect(text).toContain('期望结果：\n开关保持开启');
    expect(text).toContain('实际结果：\n刷新后回到开启前状态');
  });
});

describe('FEEDBACK_CHANNELS', () => {
  it('未开通的渠道 value 为空串（界面显示待补充，不放假链接）', () => {
    for (const channel of FEEDBACK_CHANNELS) {
      expect(typeof channel.label).toBe('string');
      expect(channel.value).toBe('');
    }
  });
});
