param([ValidateSet('init','start','stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path $PSScriptRoot -Parent
$taskLocal = Join-Path $taskRepo '.local'
$taskBin = Join-Path $taskLocal 'postgresql/pgsql/bin'
$taskData = Join-Path $taskLocal 'pgdata'
if (-not (Test-Path (Join-Path $taskBin 'pg_ctl.exe'))) { throw 'Extract the official PostgreSQL 17 Windows binaries to .local/postgresql first (see README).' }
if ($Action -eq 'stop') {
  & "$taskBin/pg_ctl.exe" -D $taskData -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL stop failed' }
  exit
}
if ($Action -eq 'init') {
  if ((Test-Path $taskData) -or (Test-Path "$taskRepo/.env") -or (Test-Path "$taskRepo/.env.test")) { throw 'Refusing to overwrite existing cluster or environment files' }
  $taskAdminPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $taskDevPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $taskTestPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $taskPasswordFile = Join-Path $taskLocal 'init-password'
  [IO.File]::WriteAllText($taskPasswordFile, $taskAdminPassword)
  try {
    & "$taskBin/initdb.exe" -D $taskData -U kanbrik_admin -A scram-sha-256 --pwfile=$taskPasswordFile --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
  } finally { Remove-Item -LiteralPath $taskPasswordFile }
}
& "$taskBin/pg_ctl.exe" -D $taskData -l "$taskLocal/postgres.log" -o '-h 127.0.0.1 -p 55432' -w start
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL start failed' }
if ($Action -eq 'init') {
  $env:PGPASSWORD = $taskAdminPassword
  try {
    # Generated hexadecimal passwords are SQL-safe; never write them to output.
    $taskSql = "CREATE ROLE kanbrik_dev LOGIN PASSWORD '$taskDevPassword'; CREATE ROLE kanbrik_test LOGIN PASSWORD '$taskTestPassword'; CREATE DATABASE kanbrik_dev OWNER kanbrik_dev; CREATE DATABASE kanbrik_test OWNER kanbrik_test;"
    $taskSql | & "$taskBin/psql.exe" -h 127.0.0.1 -p 55432 -U kanbrik_admin -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw 'Database provisioning failed' }
  } finally { Remove-Item Env:PGPASSWORD }
  $taskSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
  [IO.File]::WriteAllText("$taskRepo/.env", "DATABASE_URL=postgresql://kanbrik_dev:$taskDevPassword@127.0.0.1:55432/kanbrik_dev?schema=public`nBETTER_AUTH_URL=http://127.0.0.1:3000`nBETTER_AUTH_SECRET=$taskSecret`nKANBRIK_ENV=local`nENABLE_LOCAL_REGISTRATION=true`n")
  [IO.File]::WriteAllText("$taskRepo/.env.test", "TEST_DATABASE_URL=postgresql://kanbrik_test:$taskTestPassword@127.0.0.1:55432/kanbrik_test?schema=public`n")
}
