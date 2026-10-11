import { StarflowAccountAbout } from '@/components/StarflowAccountAbout';
export const metadata = { title: '关于此账号 · Starflow AI' };
export default async function AccountAboutPage({ params }: { params: Promise<{handle:string}> }) {
  const { handle } = await params;
  return <StarflowAccountAbout handle={handle} />;
}
