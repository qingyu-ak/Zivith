'use client';

import { useAppearanceTheme } from '@/lib/use-appearance-theme';

/** 把设置里的外观主题落到 html，时间线与工作台共用。 */
export function AppearanceThemeBoot() {
  useAppearanceTheme();
  return null;
}
