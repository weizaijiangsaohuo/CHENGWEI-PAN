# October 11 iPhone Safari screen recording review
The user recorded 45.77 seconds browsing the logged-in Starflow test deployment.
Observed: Five-position mobile navbar and official Starflow logo; actual empty home feed; Explore listing test accounts; owned profile shortcuts and settings; support message "等等" produced "AI 客服尚未完成配置".
Implemented: prevent iPhone Safari support-input focus zoom (16px instead of 14px); display explicit AI readiness (requires Cloudflare AI + two rate limit bindings); disable unavailable AI chat rather than collecting questions it cannot answer; remove stale system prompt claiming DM was cancelled; use official logo on support; eliminate duplicated Starflow logo in Explore page.
Wrangler config declares AI and ratelimits, but the test runtime returned missing-binding error. This patch does not provision Cloudflare bindings.
Do not fabricate activity or AI replies. Main/prod remains unchanged. Test preview requires deployment and real device QA.
