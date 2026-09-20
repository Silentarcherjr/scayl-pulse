import { ScenarioRunner } from '@/components/ScenarioRunner';
import { listScenarios } from '@/core/demo/demo-runner';
import { runtimeCapabilities } from '@/lib/env';

export const dynamic = 'force-dynamic';

const PIPELINE = [
  'Ingreso (webhook)',
  'Identificación del asegurado',
  'Validación de póliza',
  'Historial y preexistencias',
  'Análisis de evidencia con IA',
  'Safety Gate determinístico',
  'Clasificación del caso',
  'Hospital + aseguradora, a la vez',
  'Timeline auditable',
];

export default function Home() {
  const scenarios = listScenarios();
  const capabilities = runtimeCapabilities();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-xs tracking-widest text-[var(--muted)]">
          HACKIATHON PANAMÁ · ALERTA TEMPRANA DE INGRESOS A EMERGENCIAS
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">SCAYL&nbsp;Pulse</h1>
        <p className="max-w-2xl text-base leading-relaxed text-[var(--muted)]">
          Cuando un asegurado entra a emergencias, SCAYL Pulse abre un{' '}
          <strong className="text-[var(--foreground)]">expediente vivo</strong>: valida la póliza,
          revisa preexistencias, analiza la evidencia con IA, aplica un Safety Gate determinístico y
          notifica al hospital y a la aseguradora al mismo tiempo. Cuando llega evidencia nueva, el
          caso se reevalúa solo — y las decisiones anteriores no se borran.
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          El sistema no emite diagnósticos, no toma decisiones médicas y no puede impedir la
          atención de emergencia. Todos los datos son sintéticos.
        </p>
      </header>

      <section className="flex flex-wrap gap-2">
        {PIPELINE.map((step, index) => (
          <span
            key={step}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-[11px] text-[var(--muted)]"
          >
            {index + 1}. {step}
          </span>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Escenarios reproducibles</h2>
          <p className="font-mono text-[11px] text-[var(--muted)]">
            persistencia: {capabilities.persistence} · analizador: {capabilities.aiProvider}
            {capabilities.geminiModel ? ` (${capabilities.geminiModel})` : ''}
          </p>
        </div>
        <ScenarioRunner scenarios={scenarios} />
      </section>

      <footer className="border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)]">
        <p>
          Esta página es una superficie mínima de demostración mantenida por el backend. El
          dashboard completo (hospital y aseguradora) lo construye el Workstream B en la rama{' '}
          <code className="font-mono">workstream/frontend</code>.
        </p>
        <p className="mt-2">
          <a className="text-[var(--accent)] underline-offset-4 hover:underline" href="/api/health">
            /api/health
          </a>{' '}
          reporta qué está realmente conectado.
        </p>
      </footer>
    </main>
  );
}
