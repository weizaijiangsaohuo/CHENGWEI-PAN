import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './liquid-glass.css';
import './starflow-x.css';
import './profile-experience.css';
import './profile-media.css';
import './starflow-reference-v2.css';
import './starflow-discovery-phase2.css';
import './starflow-account-deletion.css';
import './starflow-affiliations.css';
import './starflow-official-notifications.css';
import './starflow-account-about.css';
import './starflow-mentions.css';
import './starflow-2.css';
import { LanguageProvider } from '@/components/LanguageProvider';
import { StarflowDiscovery } from '@/components/StarflowDiscovery';
import { StarflowProfileEnhancements } from '@/components/StarflowProfileEnhancements';
import { StarflowProfileMedia } from '@/components/StarflowProfileMedia';
import { StarflowProfileEditor } from '@/components/StarflowProfileEditor';
import { StarflowMobileCompose } from '@/components/StarflowMobileCompose';
import { StarflowDiscoveryPhase2 } from '@/components/StarflowDiscoveryPhase2';
import { StarflowAccountDeletion } from '@/components/StarflowAccountDeletion';
import { StarflowAffiliationBadges } from '@/components/StarflowAffiliationBadges';
import { StarflowNotificationCenter } from '@/components/StarflowNotificationCenter';
import { StarflowAccountAboutEntry } from '@/components/StarflowAccountAboutEntry';
import { StarflowMentions } from '@/components/StarflowMentions';
import { StarflowExperienceBootstrap } from '@/components/StarflowDisplayPreferences';
import { StarflowPublicAnnouncements } from '@/components/StarflowPublicAnnouncements';

export const metadata: Metadata = {
  title: '星流 Starflow · 分享此刻，连接彼此',
  description: '独立社交社区，发布动态、参与讨论、关注感兴趣的人。非 X / Twitter 官方网站。',
  applicationName: 'Starflow',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Runs before React hydration to prevent a bright flash when returning to dark mode.
// No personal data, network calls or secrets are included in this inline bootstrap.
const bootstrapAppearance = `(function(){try{
 var stored=localStorage.getItem('sf2-theme');
 var dark=stored==='dark'||(stored!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
 document.documentElement.setAttribute('data-sf2-theme',dark?'dark':'light');
}catch(e){
 var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
 document.documentElement.setAttribute('data-sf2-theme',dark?'dark':'light');
}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:bootstrapAppearance}} /></head><body><LanguageProvider><StarflowExperienceBootstrap/><StarflowPublicAnnouncements/>{children}<StarflowDiscovery /><StarflowProfileEnhancements /><StarflowProfileMedia /><StarflowProfileEditor /><StarflowMobileCompose /><StarflowDiscoveryPhase2 /><StarflowAccountDeletion /><StarflowAffiliationBadges /><StarflowNotificationCenter /><StarflowAccountAboutEntry /><StarflowMentions /></LanguageProvider></body></html>;
}
