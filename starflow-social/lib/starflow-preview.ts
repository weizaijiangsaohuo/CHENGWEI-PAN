import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createPreviewHandler } from '@/backend/auth/preview-runtime.mjs';
import { createPreviewAccessVerifier } from '@/backend/auth/preview-access.mjs';

const disabled=()=>Response.json({error:'not_permitted'},{status:404,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function handleStarflowPreview(request: Request): Promise<Response> {
  try {
    const {env}=getCloudflareContext();
    const bindings=env as unknown as Record<string,string|undefined>;
    if(bindings.STARFLOW_V2_ENABLED!=='true'||bindings.STARFLOW_V2_PREVIEW_ONLY!=='true')return disabled();
    const authorizePreview=createPreviewAccessVerifier(bindings);
    return await createPreviewHandler({env:bindings,authorizePreview})(request);
  } catch { return disabled(); }
}
