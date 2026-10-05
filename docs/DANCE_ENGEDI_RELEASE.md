# Authorized dance + En-Gedi release

User approved both games and their separate TOP 10 database changes, then manually configured the two Production activation flags. The denied Vercel environment-list API is not used again; no secret or alternate credential is requested. Functional production GET checks must confirm activation after release.

Approved starting candidate: `c9bc8640835469bdec6cc2345a883af8efa17595`.
Fresh main rechecked before mutation: `99a053de10a378c54f9aa333e4905d95491a7ccb`.

## Database applied first

Project: `jdsjvrynmnzoztfinlzi` (`the-shepherd-king-leaderboard`).
Applied name: `dance_engedi_top10`; actual database migration version: `20261005074002`.
The approved source filename was `20261005031738_dance_engedi_top10.sql`; the checked-in filename now matches the database-generated version to prevent a future migration runner from trying to apply it twice. SQL bytes are unchanged.

SQL SHA-256: `a58e45ab33e97481e5ea0cbb234b5ca106c9f5ae9949ce9f0b3ea4d2b88a7cfa`.

Post-apply read checks:
- Both new ranking tables and both new attempt tables: zero rows. No test scores or old local records uploaded.
- Six new tables have RLS enabled; anon/authenticated SELECT denied.
- Two public RPCs are security invoker with fixed search paths and 2s lock timeout; anon/authenticated EXECUTE denied, service_role EXECUTE allowed.
- Existing sling ranking: 10 rows before and after, identical row digest `d12829df35053f0e23881edc359927d6`.
- Existing sling highest-record digest unchanged: `6f66bd7f95b894a60acb4ee39909b698`.
- Existing sling RPC definition digest unchanged: `7c8cf65cc9c5014d75458fa72512a3d8`.
- Security advisor reports INFO only for RLS without policies on the private server-only tables. This is intentional deny-by-default access, not a request to grant browser policies. [Advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Release gate

Draft PR must run every existing CI job plus new dance/En-Gedi and ranking browser jobs. Local Chrome shutdown timeout results are not a substitute for a complete successful CI run at the exact PR head. Any fix changes the head and requires the whole workflow to pass again. Merge uses the expected head SHA. Production must reach READY at the resulting main commit, followed by read-only page/ranking checks and record-preservation checks. No production attempt or score submission is part of the smoke test.

Rollback disables the two new flags and restores prior code if needed; schemas/data remain pending separate deletion approval. Existing sling configuration and records remain unchanged. Physical mobile hardware and actual Korean OS IME remain unverified; emulation and synthetic composition do not remove that limitation. Server replay proves consistency of reported inputs, not honest human memorization or tamper-proof browser telemetry.

The initial remote CI exposed a real frame-gap failure in the En-Gedi cave on a software GPU. Its fixed lighting now uses inexpensive contact shadows instead of the 2048px dynamic sun shadow pass, caps the 3D drawing buffer at 480,000 pixels while retaining native-resolution DOM controls, and restores both story renderer settings on exit. The 250ms interruption limit and 10ms replay rules remain unchanged; CI checks both the performance-sensitive run and restoration. Every workflow job explicitly checks out the PR head SHA.

Scene/compositor warmup now precedes the timed run: the controls render while input and the timer remain inactive, then the original real-time clock starts after warmup. Preparation cancellation cannot start a delayed run. This removes startup-upload cost from timing without relaxing any in-run interruption check or changing server replay.

The user finalized the public names as 다윗 댄스 챌린지 and 엔게디 잠입 챌린지; internal/API/DB identifiers stay unchanged. Slow rendering detected during preparation lowers only the 3D buffer scale before the clock starts, then the selected scale remains fixed throughout the run. Simulation and interruption thresholds do not change.
