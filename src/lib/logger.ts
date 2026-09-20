type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured console logging. Never log document content or patient data —
 * pass identifiers only. All data is synthetic, but the habit matters.
 */
function emit(level: Level, message: string, context?: Record<string, unknown>) {
  const line = { level, message, at: new Date().toISOString(), ...context };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
};
