import { SocialApp } from '@/components/SocialApp';
export default async function ProfilePage({params}:{params:Promise<{handle:string}>}){
  const {handle}=await params;
  return <SocialApp view="profile" target={handle} />;
}
