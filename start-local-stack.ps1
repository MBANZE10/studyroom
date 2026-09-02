$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

Write-Host "Démarrage du stack local StudyRoom..."

docker compose up -d postgres redis

Write-Host "Le PostgreSQL et Redis sont démarrés."
Write-Host "Vous pouvez maintenant lancer : node server.js"
Write-Host "URL locale : http://localhost:3000"
Read-Host "Appuyez sur Entrée pour quitter"
