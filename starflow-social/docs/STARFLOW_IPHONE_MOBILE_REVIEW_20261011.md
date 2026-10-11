# Starflow iPhone review — 2026-10-11

Reviewed user-provided photos IMG_8135 and IMG_8136 plus two recordings, one of Xiaohongshu and another third-party product (72s), and one of Starflow current staging preview (13s).

Changes in this iteration:
1. Chat panel follows iPhone visualViewport keyboard geometry. Hide conflicting navigation while text input is focused. Maintain 16px inputs to prevent mobile Safari zoom.
2. Remove the 'discovery cards / classic feed' toggle. One unified home view remains: image/video cards and readable text card previews. Set a stable media aspect ratio before image download to reduce waterfall layout shifts.
3. Add light multicolored active tab states and short tap animations; respect reduced-motion settings. Brand logo/typography animates only during actual connection state; no artificial splash delay.
4. Settings groups existing, actually working routes into account/security, creation/community and help services. No fabricated commerce or payments.
5. Staging database was missing AI conversation schema and claim_ai_request RPC. Applied migration starflow_ai_conversation_history_and_quota to staging; RLS restricts conversations to their owners. This resolves the schema prerequisite for the user's observed 'cannot read conversation list'. Actual AI response still requires Cloudflare Workers AI bindings and model availability.

Do not merge to main without approval. Production and email configuration unchanged. Require iPhone Safari hands-on testing for UI and AI chat.
