import { Pool as NeonPool } from '@neondatabase/serverless';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createPreviewHandler } from '@/backend/auth/preview-runtime.mjs';
import { readinessResponse } from '@/backend/auth/readiness-response.mjs';
import { createConfiguredPreviewVerifier } from '@/backend/auth/preview-access.mjs';

const disabled=()=>Response.json({error:'not_permitted'},{status:404,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function handleStarflowPreview(request: Request): Promise<Response> {
  try {
    const {env}=getCloudflareContext();
    const bindings=env as unknown as Record<string,string|undefined>;
    if(bindings.STARFLOW_V2_PREVIEW_ONLY!=='true')return readinessResponse(request,disabled());
    // The shared handler keeps media, identity and all business/auth routes disabled.
    // Only the owner-authenticated readiness probe is exempt when the switch is false.
    const authorizePreview=createConfiguredPreviewVerifier(bindings);
    return readinessResponse(request,await createPreviewHandler({env:bindings,authorizePreview,Pool:NeonPool,registrationMail:undefined})(request));
  } catch { return disabled(); }
}
