import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SCAYL Pulse — Expediente vivo de emergencia',
  description:
    'Sistema de alerta temprana de ingresos a emergencias: valida la póliza, revisa preexistencias, aplica un Safety Gate determinístico y notifica al hospital y a la aseguradora simultáneamente.',
};

// Typed explicitly rather than with Next's generated `LayoutProps<'/'>`:
// that type only exists inside .next/types after a build, so using it makes
// `npm run typecheck` fail on a fresh clone before anyone has built anything.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
