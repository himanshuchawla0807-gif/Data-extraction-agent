$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$Root\oriplex-data.ps1" @args
exit $LASTEXITCODE
