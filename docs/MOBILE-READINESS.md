# Mobile readiness

## Milestone 1 — Foundation (complete)

- Locale configuration and message catalogs are independent of the page layout; a future Expo client can reuse the locale IDs and translated copy.
- `speakWithFallback` uses injected providers and is independent of React. A native client can replace the web audio and `speechSynthesis` adapters with bundled recordings and native speech APIs.
- Fixed phrase audio files and a cloud TTS provider are not configured in M1; no voice is fabricated. Add native-reviewed recordings/provider integration before the pilot.
- Home and language-picker UI are web-only. PWA service-worker caching, browser storage, Next.js routing and CSS need native equivalents.
- No domain package or backend API exists yet. Keep all calculations and workflow rules out of these UI components as later milestones add them.
- Validation: 5 unit tests, lint and production build pass. Browser checks covered the language picker, four home actions, language direction at 360px, and the offline route shell.

## Milestone 2 — Role-aware shells and dashboards (in progress)

- `resolveRoleAccess` and its pure tests are framework-independent. A React Native client can reuse the role and provider-verification decisions, but it must still enforce permissions through trusted API calls and Supabase RLS; hiding native navigation is not authorization.
- Driver/provider/admin route names and role navigation labels are in the four locale catalogs. Reuse the message keys and role-specific copy in Expo with a native navigation adapter; the current links, responsive sidebar/tab bar and CSS are web-only.
- `resolveAvailabilityStatus` is a pure domain helper with tests for missing, stale and explicitly unavailable reports. It can move into a shared core package when that package is introduced.
- `/api/dashboard/*` JSON shapes describe the reusable backend boundary. The React components and browser fetch lifecycle are web-only; a mobile app should call the same authenticated APIs rather than query role data from the client.
- Supabase RLS remains the data boundary for web and mobile alike. The web middleware/layout checks improve navigation and defense in depth but are not a substitute for those policies.
- Station discovery/detail remains list-only and guest accessible. MapLibre, MapTiler tiles, routing, TrueCost calculations and request actions are intentionally deferred; no mobile map or routing adapter has been committed in this milestone.
- All new Urdu, Roman Urdu and Punjabi Shahmukhi strings are machine-written drafts and remain marked TODO in `docs/translation-review.md`.
- Browser checks completed for guest station list and demo detail in English and Urdu at 360px: RTL direction is set correctly, no horizontal overflow was found, and station data shows Unknown plus a Demo data label. An unauthenticated request to `/app/help/new` and the report action redirects to sign-in with its return path; unauthenticated dashboard API access returns 401.
- Authenticated role redirects, provider pending UI, dashboard data and the four-tab authenticated shell still need a configured Supabase project and OTP inboxes for end-to-end browser verification.
- Validation: 13 unit tests pass; lint and production build pass. Demo seed scripts pass Node syntax checks; no live database migration or seed was run.

## Public landing and auth refresh

- Landing and authentication copy remains reusable through the four locale catalogs; the native app can reuse the language names, trust messages and safety copy with native controls.
- The supplied Chalo Yaar logo is in `apps/web/public/images/chalo-yaar-logo.png`; package or recreate an appropriately sized native asset for Expo rather than depending on the web image pipeline.
- The responsive landing/auth layouts, Next.js links, browser speaker buttons and CSS are web-specific. Keep the content and auth/API behavior, but implement presentation and navigation with native components.
- New non-English landing and auth text is machine-written and awaits review in `docs/translation-review.md`.
