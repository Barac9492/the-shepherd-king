# Sling Challenge integration review

Base story release: `b5f69af6ee594caf6e654090ada2720e428bfc20`.
Review branch: `feat/sling-challenge-prototype`, draft PR #10.

## Current integration scope

- Permanent secondary title entry and optional Chapter 1 completion-card detour, after its story and reflection
- A story-origin detour returns explicitly to Chapter 2's introduction; title-origin play returns to title
- No mid-chapter resume claim, story-save mutation, chapter unlock, story stat or competitive reward
- Skippable first-time three-target tutorial, without a clock, life loss, score, server attempt or submission; a separate device-only tutorial flag
- Existing David, sling controls/animation/audio, Bethlehem environment and boulder assets; straw target and stone record board
- Same versioned v2 course for practice and ranked play, staged target difficulty and mathematically stage-first scoring
- Practice works offline; the global board remains disabled until secure configuration and authorized activation
- Public record limited to highest score and three ASCII initials after server qualification and explicit consent
- Pause/help/blur cancellation, retry mode preservation, contextual exit, stale-request protection and version-safe record display

## Verification history

The earlier published candidate `08177f6c9b3a533c87ea14410090357e5ca5706b` passed the complete hosted suite: 242/242, including eight challenge desktop/touch scenarios, existing browser/My Shepherd checks and all ten chapters. [Run](https://github.com/Barac9492/the-shepherd-king/actions/runs/36997207490).

The v2 story/tutorial integration is a later candidate. Focused tests cover story-origin boundaries, tutorial completion/skip/relearn, no tutorial network/score/save, pending online request cancellation, missing versus empty records, v1 rejection, the shared course and stage-first score inequality. Its full hosted run must be checked for the final exact head before declaring this newer candidate validated.

Local Chromium cannot launch under this cloud sandbox's socket restrictions. No restriction was bypassed. Hosted CPU-rendered touch emulation is not physical-phone performance evidence. Protected Vercel fetch can inspect deployment assets and disabled API status, but direct interactive preview access requires Vercel login. The user declined creating a temporary bearer preview link.

## Database and privacy gates

The immutable v1 SQL was applied to the game-only project `jdsjvrynmnzoztfinlzi`; 14 read-only grant/RLS/catalog checks passed. INFO advisors were expected private RLS tables without public policies and fresh unused expiry indexes. No church database was used.

The separate v2 SQL proposal preserves v1 records and creates an isolated v2 record. Its exact approved/application status belongs in the PR outcome and Supabase migration history. Never blindly reapply either draft. See [v2 upgrade](SLING_CHALLENGE_V2_UPGRADE.md).

PGlite verifies actual local SQL, ACL/RLS and logical races in one backend. Live gateway/service-role mapping, real multi-connection contention, live score writes and physical-device experience remain separate checks. No server key has been read or configured; no production deployment or merge is authorized by a practice preview.
