import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './liquid-glass.css';
import './starflow-x.css';
import './profile-experience.css';
import './profile-media.css';
import { LanguageProvider } from '@/components/LanguageProvider';
import { StarflowDiscovery } from '@/components/StarflowDiscovery';
import { StarflowProfileEnhancements } from '@/components/StarflowProfileEnhancements';
import { StarflowProfileMedia } from '@/components/StarflowProfileMedia';

export const metadata: Metadata = {
  title: '星流 Starflow · 分享此刻，连接彼此',
  description: '独立社交社区，发布动态、参与讨论、关注感兴趣的人。非 X / Twitter 官方网站。',
  applicationName: 'Starflow',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body><LanguageProvider>{children}<StarflowDiscovery /><StarflowProfileEnhancements /><StarflowProfileMedia /></LanguageProvider></body></html>;
}
