import { SocialApp } from '@/components/SocialApp';
export default async function PostPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <SocialApp view="post" target={id} />;
}
