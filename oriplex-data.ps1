$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try {
    $Python = "python"
    $VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
    if (Test-Path $VenvPython) {
        $Python = $VenvPython
    }
    & $Python "$Root\cli.py" @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
