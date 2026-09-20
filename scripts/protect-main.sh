#!/usr/bin/env bash
# Protege `main` en GitHub.
#
# GitHub no permite proteger ramas en repositorios privados con cuenta
# gratuita, así que esto NO se puede ejecutar mientras el repo sea privado:
# devuelve 403 pidiendo GitHub Pro. Funciona en cuanto el repositorio sea
# público — que es justo cuando más importa, con el jurado mirando y tres
# personas empujando código.
#
#   bash scripts/protect-main.sh
#
# Requiere `gh` autenticado. Una sesión de Claude en la nube también puede
# ejecutarlo: api.github.com está en su allowlist.

set -euo pipefail

REPO="${1:-Silentarcherjr/scayl-pulse}"

echo "Protegiendo main en $REPO…"

gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["typecheck · lint · tests", "los tres escenarios obligatorios siguen funcionando"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo
echo "Listo. A partir de ahora:"
echo "  · main solo se toca por Pull Request"
echo "  · el PR necesita CI en verde para poder fusionarse"
echo "  · cero aprobaciones requeridas, para no bloquearos entre vosotros"
echo "  · prohibido el force push y el borrado de main"
echo "  · los admins (Anthony) pueden saltárselo en una emergencia"
