import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { AppearanceThemeBoot } from '@/components/appearance-theme-boot';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zivith 创作工作室',
  description: 'AI 原生影视创作工作室',
};

const APPEARANCE_BOOT = `try{var t=localStorage.getItem('zivith.appearanceTheme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark'}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="appearance-theme" strategy="beforeInteractive">
          {APPEARANCE_BOOT}
        </Script>
        <AppearanceThemeBoot />
        {children}
      </body>
    </html>
  );
}
