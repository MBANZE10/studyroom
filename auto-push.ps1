$ErrorActionPreference = 'Stop'

$repoPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoPath

Write-Host "Vérification des changements Git..."
git status --short

$changes = git status --porcelain
if (-not $changes) {
    Write-Host "Aucun changement à enregistrer."
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 0
}

$commitMessage = Read-Host "Message du commit"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "StudyRoom update"
}

git add .
git commit -m $commitMessage
git push origin main

Write-Host "Push GitHub terminé avec succès."
Read-Host "Appuyez sur Entrée pour quitter"
