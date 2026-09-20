#!/usr/bin/env node
/**
 * Genera el PDF del entregable de herramientas de IA desde la plantilla HTML.
 *
 * Busca un Chrome o Chromium headless en las rutas habituales de macOS, Linux
 * y Windows, en lugar de depender de una ruta escrita a mano: el entregable
 * tiene que poder generarse desde cualquier máquina del equipo, desde una
 * sesión en la nube o desde CI, no solo desde el portátil de una persona.
 *
 *   node scripts/build-pdf.mjs [salida.pdf]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error(
    'No se encontró Chrome ni Chromium.\n' +
      'Instala uno, o indica la ruta con CHROME_PATH=/ruta/al/binario.\n' +
      'Alternativa sin instalar nada: lanza el workflow «Generar PDF del entregable»\n' +
      'en la pestaña Actions de GitHub y descarga el artefacto.',
  );
  process.exit(1);
}

const source = resolve('docs/deliverables/ai-tools-report.html');
const output = resolve(process.argv[2] ?? 'docs/deliverables/SCAYL_Pulse_Herramientas_IA.pdf');

if (!existsSync(source)) {
  console.error(`No existe la plantilla: ${source}`);
  process.exit(1);
}
mkdirSync(dirname(output), { recursive: true });

execFileSync(
  chrome,
  [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${output}`,
    pathToFileURL(source).href,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

console.log(`PDF generado con ${chrome}`);
console.log(`  → ${output}`);
