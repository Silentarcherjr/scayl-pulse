# Verificación de frontend — Workstream B

Estas pruebas pertenecen a la interfaz. No modifican los escenarios, fixtures,
tests de backend ni QA de integraciones del Workstream C.

## Pruebas unitarias de presentación y actualización

```powershell
npm run verify
npx vitest run --config src/components/frontend-tests/vitest.config.mts
```

La segunda orden ejecuta la suite adicional de frontend: orden por `seq`,
decisiones históricas, fuentes de IA, Safety Gate, documentos obligatorios y
recomendados, errores HTTP, polling, suscripción Realtime simulada, reconexión
y cancelación al cambiar de expediente. No requiere credenciales.

## Recorrido en navegador local

El script abre la interfaz y usa sus botones y formularios con el backend
local. Crea cuatro casos sintéticos por ejecución. Rechaza una URL remota o un
servidor que no use memoria y analizador determinístico.

En una terminal PowerShell:

```powershell
$env:SCAYL_FORCE_IN_MEMORY='true'
$env:SCAYL_FORCE_FIXTURE_AI='true'
$env:ADMISSION_WEBHOOK_SECRET=''
npm run dev -- --port 3100
```

En otra terminal, con Microsoft Edge instalado:

```powershell
npm install --prefix "$env:TEMP\scayl-pulse-frontend-tools" --no-save --no-package-lock playwright
$env:FRONTEND_PLAYWRIGHT_MODULE="$env:TEMP\scayl-pulse-frontend-tools\node_modules\playwright\index.mjs"
node src/components/frontend-tests/smoke-browser.mjs
```

No añade dependencias al proyecto. `FRONTEND_BROWSER_CHANNEL=chrome` permite
usar Chrome instalado; `FRONTEND_TEST_URL` permite otro puerto local.

Comprueba GREEN, YELLOW con dos aportaciones de evidencia, historial RED,
resumen solo al solicitarlo, cierre humano terminal, ingreso libre, enlace
persistente al recargar, navegación de pestañas por teclado y ausencia de
desbordamiento horizontal a 390, 768 y 1440 px. Guarda capturas en `.next/`.

La conexión a un Supabase real queda para la validación de despliegue con el
responsable de ese entorno; esta suite prueba su ciclo de suscripción con un
cliente simulado y el polling contra HTTP local real.
