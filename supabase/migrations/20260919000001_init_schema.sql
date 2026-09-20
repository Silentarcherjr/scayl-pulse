-- =============================================================================
-- SCAYL Pulse — initial schema
-- Source of truth for emergency admission cases (docs/DECISIONS.md DEC-001).
-- All data stored here is SYNTHETIC (DEC-002).
-- =============================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Enumerations — mirror src/core/domain/case-status.ts and types.ts.
-- Changing these requires changing the TypeScript source of truth first.
-- --------------------------------------------------------------------------
create type case_status as enum (
  'ADMITTED', 'CHECKING', 'VERIFIED', 'DOCUMENTS_REQUIRED',
  'HUMAN_REVIEW', 'REASSESSING', 'RESOLVED'
);

create type policy_status as enum ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');
create type network_status as enum ('IN_NETWORK', 'OUT_OF_NETWORK', 'UNKNOWN');
create type history_source as enum ('DECLARED', 'CLAIM', 'PROVIDER_RECORD');
create type notification_channel as enum ('HOSPITAL_ADMISSIONS', 'INSURER_CASE_MANAGER');
create type notification_status as enum ('SENT', 'FAILED');

create type document_type as enum (
  'ADMISSION_FORM', 'PATIENT_ID', 'MEDICAL_REPORT', 'TRIAGE_NOTE', 'LAB_RESULT',
  'IMAGING_REPORT', 'SPECIALIST_REPORT', 'COST_ESTIMATE', 'AUTHORIZATION_REQUEST', 'OTHER'
);

create type case_event_type as enum (
  'ADMISSION_RECEIVED', 'PATIENT_IDENTIFIED', 'PATIENT_NOT_FOUND', 'POLICY_RETRIEVED',
  'POLICY_VALIDATED', 'HISTORY_RETRIEVED', 'AI_ANALYSIS_STARTED', 'AI_ANALYSIS_COMPLETED',
  'AI_ANALYSIS_FAILED', 'SAFETY_GATE_APPLIED', 'CASE_CLASSIFIED', 'HOSPITAL_NOTIFIED',
  'INSURER_NOTIFIED', 'NOTIFICATION_FAILED', 'NEW_EVIDENCE_RECEIVED', 'REASSESSMENT_STARTED',
  'DECISION_UPDATED', 'CASE_RESOLVED'
);

create type event_actor as enum ('SYSTEM', 'HOSPITAL', 'INSURER', 'AI_AGENT', 'SAFETY_GATE', 'DEMO_RUNNER');

-- --------------------------------------------------------------------------
-- Reference data
-- --------------------------------------------------------------------------
create table hospitals (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  network_status     network_status not null default 'UNKNOWN',
  admissions_contact text not null,
  created_at         timestamptz not null default now()
);

create table patients (
  id          uuid primary key default gen_random_uuid(),
  national_id text not null unique,
  full_name   text not null,
  birth_date  date not null,
  created_at  timestamptz not null default now()
);

create table policies (
  id                   uuid primary key default gen_random_uuid(),
  policy_number        text not null unique,
  patient_id           uuid not null references patients(id) on delete cascade,
  insurer              text not null,
  plan_code            text not null,
  status               policy_status not null,
  effective_from       date not null,
  effective_to         date not null,
  waiting_period_days  integer not null default 0 check (waiting_period_days >= 0),
  emergency_coverage   boolean not null default true,
  case_manager_contact text not null,
  exclusions           jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  constraint policies_period_valid check (effective_to >= effective_from)
);

create index policies_patient_id_idx on policies(patient_id);

create table medical_history (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references patients(id) on delete cascade,
  condition_code  text not null,
  condition_label text not null,
  diagnosed_at    date not null,
  source          history_source not null,
  notes           text,
  created_at      timestamptz not null default now()
);

create index medical_history_patient_id_idx on medical_history(patient_id);

-- --------------------------------------------------------------------------
-- Cases
-- --------------------------------------------------------------------------
create table cases (
  id               uuid primary key default gen_random_uuid(),
  case_number      text not null unique,
  status           case_status not null default 'ADMITTED',
  hospital_id      uuid references hospitals(id) on delete set null,
  patient_id       uuid references patients(id) on delete set null,
  policy_id        uuid references policies(id) on delete set null,
  admission        jsonb not null,
  current_decision jsonb,
  scenario_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index cases_status_idx     on cases(status);
create index cases_created_at_idx on cases(created_at desc);
create index cases_scenario_idx   on cases(scenario_id);

-- --------------------------------------------------------------------------
-- Append-only audit timeline
--
-- Immutability is enforced by the database, not by convention: UPDATE and
-- DELETE are rejected by a trigger, so no application bug (and no agent) can
-- rewrite history.
-- --------------------------------------------------------------------------
create table case_events (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references cases(id) on delete cascade,
  seq           integer not null,
  type          case_event_type not null,
  actor         event_actor not null,
  status_before case_status,
  status_after  case_status,
  message       text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (case_id, seq)
);

create index case_events_case_id_seq_idx on case_events(case_id, seq);

-- Assigns the per-case sequence number atomically.
create or replace function case_events_assign_seq() returns trigger
language plpgsql as $$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1 into new.seq
      from case_events where case_id = new.case_id;
  end if;
  return new;
end;
$$;

create trigger case_events_assign_seq_trg
  before insert on case_events
  for each row execute function case_events_assign_seq();

-- Hard immutability guard.
create or replace function case_events_reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'case_events is append-only: % is not allowed', tg_op;
end;
$$;

create trigger case_events_no_update_trg
  before update on case_events
  for each row execute function case_events_reject_mutation();

create trigger case_events_no_delete_trg
  before delete on case_events
  for each row execute function case_events_reject_mutation();

-- --------------------------------------------------------------------------
-- Evidence, notifications, AI audit
-- --------------------------------------------------------------------------
create table case_evidence (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references cases(id) on delete cascade,
  document_type document_type not null,
  title         text not null,
  content       text not null,
  submitted_by  text not null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index case_evidence_case_id_idx on case_evidence(case_id, created_at);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references cases(id) on delete cascade,
  channel    notification_channel not null,
  recipient  text not null,
  subject    text not null,
  body       text not null,
  status     notification_status not null default 'SENT',
  created_at timestamptz not null default now()
);

create index notifications_case_id_idx on notifications(case_id, created_at);

create table ai_interactions (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid references cases(id) on delete cascade,
  provider     text not null,
  model        text not null,
  valid        boolean not null,
  latency_ms   integer not null default 0,
  error        text,
  raw_response text,
  created_at   timestamptz not null default now()
);

create index ai_interactions_case_id_idx on ai_interactions(case_id, created_at);

-- --------------------------------------------------------------------------
-- updated_at maintenance
-- --------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cases_set_updated_at
  before update on cases
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- Realtime: the dashboards subscribe to case changes and timeline appends.
-- --------------------------------------------------------------------------
alter publication supabase_realtime add table cases;
alter publication supabase_realtime add table case_events;
