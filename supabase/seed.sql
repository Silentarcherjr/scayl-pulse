-- =============================================================================
-- SCAYL Pulse — synthetic seed data
--
-- Mirrors src/data/synthetic/reference-data.ts. Dates are relative to
-- CURRENT_DATE so the fixtures never expire.
--
-- Run with:  supabase db reset      (local)
--            psql "$DATABASE_URL" -f supabase/seed.sql   (remote)
-- =============================================================================

truncate table ai_interactions, notifications, case_evidence, case_events, cases restart identity cascade;
truncate table medical_history, policies, patients, hospitals restart identity cascade;

insert into hospitals (id, code, name, network_status, admissions_contact) values
  ('00000000-0000-4000-8000-000000000001', 'HOSP-PTY-01', 'Hospital Nacional Metropolitano (sintético)', 'IN_NETWORK',     'admisiones@hospital-metropolitano.example'),
  ('00000000-0000-4000-8000-000000000002', 'HOSP-PTY-02', 'Clínica San Miguel (sintético)',              'IN_NETWORK',     'admisiones@clinica-sanmiguel.example'),
  ('00000000-0000-4000-8000-000000000099', 'HOSP-PTY-99', 'Centro Médico Costa Verde (sintético, fuera de red)', 'OUT_OF_NETWORK', 'admisiones@costaverde.example');

insert into patients (id, national_id, full_name, birth_date) values
  ('00000000-0000-4000-8001-000000000001', '8-888-1111', 'María Gómez Salazar',  '1988-04-12'),
  ('00000000-0000-4000-8001-000000000002', '8-777-2222', 'Luis Cedeño Ortega',   '1995-11-03'),
  ('00000000-0000-4000-8001-000000000003', '8-666-3333', 'Ana Batista Rivera',   '1971-02-27'),
  ('00000000-0000-4000-8001-000000000004', '8-555-4444', 'Jorge Pinto Delgado',  '1980-07-19');

insert into policies (
  id, policy_number, patient_id, insurer, plan_code, status,
  effective_from, effective_to, waiting_period_days, emergency_coverage,
  case_manager_contact, exclusions
) values
  ('00000000-0000-4000-8002-000000000001', 'POL-1001', '00000000-0000-4000-8001-000000000001',
   'SCAYL Seguros (sintético)', 'SALUD-PLENA-300', 'ACTIVE',
   current_date - 400, current_date + 330, 30, true,
   'gestor.casos@scayl-seguros.example', '["Cirugía estética","Tratamientos experimentales"]'::jsonb),

  ('00000000-0000-4000-8002-000000000002', 'POL-2002', '00000000-0000-4000-8001-000000000002',
   'SCAYL Seguros (sintético)', 'SALUD-ESENCIAL-150', 'ACTIVE',
   current_date - 200, current_date + 165, 30, true,
   'gestor.casos@scayl-seguros.example', '["Cirugía estética"]'::jsonb),

  -- Starts AFTER the hypertension diagnosis below: this is what makes the RED
  -- scenario a genuine pre-existing-condition question.
  ('00000000-0000-4000-8002-000000000003', 'POL-3003', '00000000-0000-4000-8001-000000000003',
   'SCAYL Seguros (sintético)', 'SALUD-PLENA-300', 'ACTIVE',
   current_date - 90, current_date + 275, 60, true,
   'gestor.casos@scayl-seguros.example', '["Cirugía estética","Tratamientos experimentales"]'::jsonb),

  ('00000000-0000-4000-8002-000000000004', 'POL-4004', '00000000-0000-4000-8001-000000000004',
   'SCAYL Seguros (sintético)', 'SALUD-ESENCIAL-150', 'EXPIRED',
   current_date - 800, current_date - 60, 30, true,
   'gestor.casos@scayl-seguros.example', '[]'::jsonb);

insert into medical_history (id, patient_id, condition_code, condition_label, diagnosed_at, source, notes) values
  ('00000000-0000-4000-8003-000000000001', '00000000-0000-4000-8001-000000000001', 'Z88.0', 'Alergia a penicilina',
   current_date - 1500, 'DECLARED', 'Declarada en la suscripción de la póliza.'),
  ('00000000-0000-4000-8003-000000000002', '00000000-0000-4000-8001-000000000002', 'S82.6', 'Fractura de maléolo lateral (tobillo derecho)',
   current_date - 1800, 'CLAIM', 'Resuelta. Sin secuelas reportadas.'),
  ('00000000-0000-4000-8003-000000000003', '00000000-0000-4000-8001-000000000003', 'I10', 'Hipertensión arterial esencial',
   current_date - 420, 'PROVIDER_RECORD', 'Diagnóstico registrado antes del inicio de la póliza vigente.'),
  ('00000000-0000-4000-8003-000000000004', '00000000-0000-4000-8001-000000000003', 'E78.5', 'Dislipidemia mixta',
   current_date - 400, 'PROVIDER_RECORD', 'Control con estatinas.');
