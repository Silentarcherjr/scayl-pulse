-- =============================================================================
-- Row Level Security
--
-- Posture for the hackathon MVP:
--   * every table has RLS enabled;
--   * the anon key may only READ (the dashboards are read-only views over
--     exclusively synthetic data);
--   * every write goes through the server using the service-role key, which
--     bypasses RLS — hospitals authenticate to the webhook with a shared
--     secret, not with a Supabase session.
--
-- A production deployment would replace "anon can read everything" with
-- per-tenant policies keyed on the insurer / hospital of the authenticated
-- user. Tracked in docs/IDEAS.md (IDEA-002).
-- =============================================================================

alter table hospitals       enable row level security;
alter table patients        enable row level security;
alter table policies        enable row level security;
alter table medical_history enable row level security;
alter table cases           enable row level security;
alter table case_events     enable row level security;
alter table case_evidence   enable row level security;
alter table notifications   enable row level security;
alter table ai_interactions enable row level security;

create policy "read synthetic hospitals"  on hospitals       for select using (true);
create policy "read synthetic patients"   on patients        for select using (true);
create policy "read synthetic policies"   on policies        for select using (true);
create policy "read synthetic history"    on medical_history for select using (true);
create policy "read cases"                on cases           for select using (true);
create policy "read case events"          on case_events     for select using (true);
create policy "read case evidence"        on case_evidence   for select using (true);
create policy "read notifications"        on notifications   for select using (true);

-- ai_interactions deliberately has NO select policy for anon: raw model
-- responses are an internal audit artifact, read server-side only.
