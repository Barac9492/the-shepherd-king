-- Read-only verification after the separately approved migration. No score/room creation.
SELECT n.nspname,c.relname,c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='keilah_coop' AND c.relkind='r' ORDER BY c.relname;
SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='keilah_coop' OR (n.nspname='public' AND p.proname='keilah_coop_rpc')
ORDER BY n.nspname,p.proname;
SELECT role,has_schema_privilege(role,'keilah_coop','USAGE') AS schema_usage
FROM unnest(ARRAY['anon','authenticated','service_role']) role;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='keilah_coop' ORDER BY tablename,indexname;
