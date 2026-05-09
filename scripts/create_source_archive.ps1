param(
    [string]$OutputPath = "dist/data-extraction-agent-open-source.zip"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
    $files = git ls-files
    if (-not $files) {
        throw "No tracked files found. Run this from a git repository after staging/committing source files."
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("data-extraction-agent-open-" + [guid]::NewGuid().ToString("N"))
    $packageRoot = Join-Path $tempRoot "data-extraction-agent-open"
    New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

    foreach ($file in $files) {
        $target = Join-Path $packageRoot $file
        $targetDir = Split-Path -Parent $target
        if ($targetDir) {
            New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        }
        Copy-Item -LiteralPath $file -Destination $target -Force
    }

    $resolvedOutput = Join-Path $repoRoot $OutputPath
    $outputDir = Split-Path -Parent $resolvedOutput
    if ($outputDir) {
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    }
    if (Test-Path $resolvedOutput) {
        Remove-Item -LiteralPath $resolvedOutput -Force
    }

    Compress-Archive -Path $packageRoot -DestinationPath $resolvedOutput -Force
    Write-Host "Created source archive: $resolvedOutput"
}
finally {
    if ($tempRoot -and (Test-Path $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
    Pop-Location
}
