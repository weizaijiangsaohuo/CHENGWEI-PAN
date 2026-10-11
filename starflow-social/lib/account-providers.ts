import type { Provider } from '@supabase/supabase-js';

// Public flags: never place OAuth client secrets in NEXT_PUBLIC_ variables.
export type ProviderKey='google'|'apple'|'facebook'|'twitter'|'wechat'|'qq';
export type LinkedProvider={key:ProviderKey;label:string;provider:Provider;enabled:boolean;requirement:string};
const wx=process.env.NEXT_PUBLIC_WECHAT_OAUTH_PROVIDER||'';
const qq=process.env.NEXT_PUBLIC_QQ_OAUTH_PROVIDER||'';
export const linkedProviders:readonly LinkedProvider[]=[
 {key:'google',label:'Google',provider:'google',enabled:process.env.NEXT_PUBLIC_GOOGLE_ENABLED==='true',requirement:'需要启用 Supabase Google OAuth。'},
 {key:'apple',label:'Apple ID',provider:'apple',enabled:process.env.NEXT_PUBLIC_APPLE_ENABLED==='true',requirement:'需要 Apple Developer 应用凭据和 Supabase Apple OAuth。'},
 {key:'facebook',label:'Facebook',provider:'facebook',enabled:process.env.NEXT_PUBLIC_FACEBOOK_ENABLED==='true',requirement:'需要 Meta 开发者应用与 Supabase Facebook OAuth。'},
 {key:'twitter',label:'X',provider:'twitter',enabled:process.env.NEXT_PUBLIC_X_ENABLED==='true',requirement:'需要 X Developer OAuth 2.0 应用及 Supabase Twitter OAuth。'},
 {key:'wechat',label:'微信',provider:(wx.startsWith('custom:')?wx:'custom:wechat') as Provider,
  enabled:process.env.NEXT_PUBLIC_WECHAT_ENABLED==='true'&&wx.startsWith('custom:'),
  requirement:'需要微信开放平台批准的网页授权，以及已配置的 Supabase Custom OAuth/OIDC 提供商。'},
 {key:'qq',label:'QQ',provider:(qq.startsWith('custom:')?qq:'custom:qq') as Provider,
  enabled:process.env.NEXT_PUBLIC_QQ_ENABLED==='true'&&qq.startsWith('custom:'),
  requirement:'需要 QQ 互联开放平台批准的应用，以及已配置的 Supabase Custom OAuth/OIDC 提供商。'},
];
export const activeLoginProviders=linkedProviders.filter(item=>item.enabled);
