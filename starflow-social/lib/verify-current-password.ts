import {createClient} from '@supabase/supabase-js';

type VerifyOptions={email:string;password:string;expectedUserId:string;captchaToken?:string};

/** Require actual prior-password authentication even when GoTrue's Require Current Password toggle is off. */
export async function verifyCurrentPassword({email,password,expectedUserId,captchaToken}:VerifyOptions):Promise<void>{
 if(!email||!password||!expectedUserId)throw Error('缺少当前密码验证信息。');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)throw Error('账号认证服务未配置。');
 const isolated=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  const {data,error}=await isolated.auth.signInWithPassword({email,password,options:{captchaToken}});
  if(error)throw Error('当前密码验证失败：'+error.message);
  if(data.user?.id!==expectedUserId)throw Error('验证结果并非当前 Starflow 账户。');
 }finally{
  // A temporary session is not the active browser session; revoke local only.
  await isolated.auth.signOut({scope:'local'});
 }
}
