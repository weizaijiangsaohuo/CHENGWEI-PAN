# Starflow 2.0 — Existing UI audit and regression map

## Evidence inspected
- Two user-provided iPhone screen recordings (09:01 and 09:06, October 12, 2026) were inspected as a sampled set of video frames for navigation/visual hierarchy.
- Source modules and styles were reviewed: SocialApp, StarflowMessages, StarflowMobileNavigation, StarflowHomeMenu, StarflowMasonryFeed, liquid-glass.css, starflow-x.css, starflow-reference-v2.css and globals.css.
- Comparison principles: X's content-first information hierarchy and Apple-inspired controls. This is not a copied asset library.

## Identified issues
| Severity | Evidence | Decision |
| --- | --- | --- |
| P0 | Multiple global CSS layers and later selector overrides | Introduce final semantic CSS layer without destructive deletion; track legacy cleanup separately |
| P0 | Earlier voice input errors and audio buffering surfaced by real Safari usage | Retain previous audio bugfix; include live end-to-end regression |
| P1 | Large gradients, shadows and radii compete with content | Use neutral reading surfaces; reserve purple for selected controls |
| P1 | Mobile tab active state changed icon/text but lacked continuous glass selection | Real route-derived transform indicator, reduced motion fallback |
| P1 | Settings allowed reduced motion and compact mode, not full theme choice | Add Light/Dark/System theme selector; persist preference |
| P1 | No consistent route skeleton while Next waits | Add route-loading skeleton (not simulated content) |
| P1 | Heavy backdrop filters applied to reading areas | Limit glass to navigation, tools, sheets; avoid repaint-heavy scroll decoration |
| P1 | Existing admin UX visually diverges from social frontend | Shared typography, borders, spacing, colors and control surfaces |
| P2 | Many layout media breakpoints and special-case patches | Normalize latest layer; plan later elimination of superseded CSS only after visual regression |

## What the code change does NOT prove
- No performance traces collected from Android, iOS, Windows or macOS.
- No proof of Safari native optical refraction parity; CSS uses a restrained approximation.
- No proof all server-side messaging, video calling, push, media attachments or search queries are operational in every client. Those require further backend and device test passes.
- Figma prototype links show design flows; actual UI functions remain in the production site.

## Pre-release checklist
1. CI: run full npm check, TypeScript, build, browser hydration.
2. Phone UI: 360px, 390px and 430px widths, Safari safe area and keyboard, no hidden bottom CTA.
3. Desktop UI: 1024px, 1280px and 1440px with context rail collapses.
4. Light + Dark + System: post content, visual details, dialogs, labels and admin confirm states readable.
5. Voice: user-approved mic access, private download/codec fallback, STT, one-time location, call permissions.
6. Admin: @wei sees Super Admin role, unauthorized account remains blocked; mutation logs stay intact.
7. Production: match Cloudflare deployed commit/version to PR merge; verify 100% traffic and service response.
