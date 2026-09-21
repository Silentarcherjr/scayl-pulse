import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Each HTTP suite owns its server; it never targets a configured deployment. */
export async function startLocalServer() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No local port allocated');
  const port = address.port;
  await new Promise<void>((done) => socket.close(() => done()));

  const child = spawn(process.execPath, [
    resolve('node_modules/next/dist/bin/next'), 'dev', '--webpack',
    '--hostname', '127.0.0.1', '--port', String(port),
  ], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      SCAYL_FORCE_IN_MEMORY: 'true',
      SCAYL_FORCE_FIXTURE_AI: 'true',
      SCAYL_MAX_CASES: '200',
      ADMISSION_WEBHOOK_SECRET: '',
      GEMINI_API_KEY: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
  });
  let output = '';
  let spawnError: Error | undefined;
  child.on('error', (error) => { spawnError = error; });
  const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-8000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 110_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      try {
        const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) return { baseUrl, stop: () => stopServer(child) };
      } catch { /* The server may still be compiling its first route. */ }
      await delay(250);
    }
    throw new Error(`Local HTTP server did not become ready: ${output}`);
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

async function stopServer(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Next dev has a child process. Stop only the tree owned by this suite.
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore',
    });
    await once(killer, 'exit');
  } else {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
}
