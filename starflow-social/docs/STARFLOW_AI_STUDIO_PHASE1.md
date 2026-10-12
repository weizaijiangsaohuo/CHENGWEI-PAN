# Starflow AI Studio — Phase 1 (2026-10-12)

## Scope
Route: /ai-studio. Mobile-first prompt composer, private uploads, owner-scoped jobs and results.

| Mode | Verified model | Input |
| --- | --- | --- |
| Image | fal-ai/flux-2 | prompt, aspect |
| Text-to-video | fal-ai/kling-video/v2.5-turbo/pro/text-to-video | prompt, 5/10 sec |
| Image-to-video | fal-ai/kling-video/v2.5-turbo/pro/image-to-video | image, prompt, 5/10 sec |
| Motion reference | fal-ai/kling-video/v2.6/standard/motion-control | photo and reference video |
| AI video edit | fal-ai/wan/v2.7/edit-video | video and instruction, optional image |

API references:
- https://fal.ai/models/fal-ai/flux-2/api
- https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/text-to-video/api
- https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/api
- https://fal.ai/models/fal-ai/kling-video/v2.6/standard/motion-control/api
- https://fal.ai/models/fal-ai/wan/v2.7/edit-video/api

These are licensed/paid third-party models, not a self-trained Starflow foundation
model. There is no evidence yet of superiority over Jimeng, Kling, Xiaoyunque or
Doubao. Motion mode transfers visible movements to the uploaded character
reference, but does not guarantee pixel-identical face replacement. Video editing
is instruction-based generative transformation, not yet a multi-track timeline.

## Required deployment sequence
1. Apply supabase/migrations/20261012_ai_creative_studio.sql to staging and run
   auth/RLS + duplicate-claim checks, then production only after approval.
2. Configure server-only FAL_KEY as a Cloudflare secret. Never use NEXT_PUBLIC_FAL_KEY.
3. Fund the Fal account and add spend alerts/quality benchmarks.
4. After verification, set STARFLOW_CREATIVE_ENABLED=true on Cloudflare.
5. Verify actual five-second jobs on iPhone Safari and desktop Chrome.
6. Update terms/privacy policy for third-party biometric/reference image processing,
   ownership rights and provider output URLs.

Without the enabled flag and server key, submission returns a truthful 503.
There is no synthetic output, demo job or browser-exposed inference key.

## Security and workflow
User JWT -> authenticated API -> private owner-only storage -> six-hour signed URL
-> atomic sf_creative_claim (one concurrent job/user; eight images or two
video tasks/24h; global 150 images or 25 videos/24h) -> Fal Queue submit
-> owner-scoped job -> GET status -> provider media URL. Supabase RLS isolates
jobs and media; no service_role is used in application calls. User explicitly
attests rights/permission before sending reference media to a third party.

Failed attempts count toward limits to prevent evasion via owner status edits.
Output URLs may expire. Users must save outputs promptly; archival to private
storage and durable delivery are Phase 2. Provider media may not be private
even if the user's uploaded source was in a private bucket.

## Limitations / next engineering phase
- Provider credentials, funds, deployment and end-to-end output are NOT verified.
- Up to 8MB source images and 50MB source videos; server-side video duration
  probing is not implemented. Wan editing expects short clips (2–10s).
- Some browser audio/video formats may need transcoding before inference.
- No webhook completion, queue cancellation, user payments or provider budget API.
- Face/identity integrity, facial consent verification, full editing timeline,
  shot planning, captions, transitions, background music, 4K, native background
  jobs and quality comparisons are NOT delivered in Phase 1.
- Next: add private result archival, native editing timeline, multi-shot prompt
  planning, model routing and verifiable tests of motion/identity consistency.
