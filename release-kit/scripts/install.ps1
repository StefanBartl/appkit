<#
.SYNOPSIS
Install an app for the current user on Windows, without administrator rights (release-kit of appkit).

.DESCRIPTION
Downloads the Windows build of the app from its GitHub release, checks it against the SHA256SUMS of
that release, and installs it in the way the app is built:

  hub    a program with its own `install` command (a .zip with the program, or the bare program):
         runs `<program> install`, which copies it to its fixed place
  nsis   an NSIS setup: runs it silently (/S)
  inno   an Inno Setup: runs it silently (/VERYSILENT /SUPPRESSMSGBOXES /CURRENTUSER /NORESTART)

A file this script downloads carries no Mark-of-the-Web, so SmartScreen does not stop the setup.
What is checked instead is that the file is the one the release lists in SHA256SUMS: nothing runs
when it does not match. (That proves the file is whole and the one of the release, not who made the
release.)

The copy attached to a release is stamped by the release workflow: it knows its repository, its app
and its channel (the release it came with, or the rolling build `latest`) and runs without
parameters, also through Invoke-Expression:

  powershell -ExecutionPolicy Bypass -c "irm https://github.com/OWNER/NAME/releases/download/latest/install.ps1 | iex"

Run it in your own PowerShell, not elevated: the apps install for one user, and an elevated session
belongs to the administrator account, whose profile would get the app.

Parameters (all optional):

  -Version TAG        a release to install instead of the channel of this copy
  -Rolling            the rolling build of main (the pre-release `latest`) instead
  -File PATH          a build you already have: nothing is downloaded; the checksum then comes from
                      -Sums, -Sha256 or a SHA256SUMS file next to it
  -Sums PATH          a SHA256SUMS file ("<hash>  <file>" per line)
  -Sha256 HEX         the expected SHA-256 of the file
  -InstallArgs A,B    more arguments for the install step (`<program> install ...` or the setup)
  -AllowElevated      install although the session is elevated (a build machine)
  -Repo, -App, -Kind, -Program, -ReleaseAsset, -RollingAsset
                      what the release workflow stamps into this copy; given here, they win (for a
                      copy that is not stamped). -ReleaseAsset may hold {version} (the tag without
                      its v) and {triple} (x86_64-pc-windows-msvc).

.EXAMPLE
.\install.ps1 -InstallArgs '--autostart'
#>

# Everything runs in a script block of its own, which takes the parameters: run through
# Invoke-Expression, the script sets no variable, strict mode or preference of the session of the
# person who runs it. `@args` hands named parameters and switches on as they were given.
& {
    param(
        [string] $Version = '',
        [switch] $Rolling,
        [string] $File = '',
        [string] $Sums = '',
        [string] $Sha256 = '',
        [string[]] $InstallArgs = @(),
        [switch] $AllowElevated,
        [string] $Repo = '',
        [string] $App = '',
        [string] $Kind = '',
        [string] $Program = '',
        [string] $ReleaseAsset = '',
        [string] $RollingAsset = ''
    )
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'

    # release-kit:stamp:begin (filled by the publish action of release-kit; empty in the source)
    $StampRepo = ''
    $StampChannel = ''
    $StampApp = ''
    $StampKind = ''
    $StampProgram = ''
    $StampReleaseAsset = ''
    $StampRollingAsset = ''
    # release-kit:stamp:end

    # A plain word: it goes into a URL, a file name and a command line. `\z`, not `$`: `$` also
    # matches before a final line break.
    $plain = '^[A-Za-z0-9._-]+\z'

    function Stop-Install([string] $Message) {
        throw "install.ps1: $Message"
    }

    function Pick([string] $Given, [string] $Stamped) {
        if ($Given -ne '') { return $Given }
        return $Stamped
    }

    $repo = Pick $Repo $StampRepo
    $app = Pick $App $StampApp
    $kind = Pick $Kind $StampKind
    $program = Pick $Program $StampProgram
    $releaseAsset = Pick $ReleaseAsset $StampReleaseAsset
    $rollingAsset = Pick $RollingAsset $StampRollingAsset

    if ($app -eq '') { $app = 'app' }
    if ($app -cnotmatch $plain) { Stop-Install "-App must be a plain word: $app" }
    if (@('hub', 'nsis', 'inno') -cnotcontains $kind) {
        Stop-Install "-Kind must be hub, nsis or inno (this copy is not stamped: give -Kind and the rest)"
    }
    if ($kind -eq 'hub' -and $program -cnotmatch $plain) {
        Stop-Install '-Program must be the file name of the program'
    }

    # The app belongs to one user: elevated, it would be the administrator account.
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $AllowElevated -and $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Stop-Install 'do not run this elevated: it installs for one user, without administrator rights (-AllowElevated for a build machine)'
    }

    $work = Join-Path ([IO.Path]::GetTempPath()) ("$app-install-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        if ($File -eq '') {
            if ($repo -cnotmatch '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\z') {
                Stop-Install '-Repo must be OWNER/NAME (this copy is not stamped)'
            }
            if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
                Stop-Install "no build for Windows on $env:PROCESSOR_ARCHITECTURE"
            }
            # Windows PowerShell 5.1 may offer a fixed set without TLS 1.2: it is added, nothing taken
            # away. SystemDefault (0, what pwsh has) lets the system choose, TLS 1.3 included: left alone.
            $offered = [Net.ServicePointManager]::SecurityProtocol
            if ([int] $offered -ne 0 -and -not ($offered -band [Net.SecurityProtocolType]::Tls12)) {
                [Net.ServicePointManager]::SecurityProtocol = $offered -bor [Net.SecurityProtocolType]::Tls12
            }

            # The channel: what was asked, else what this copy was stamped with, else the newest
            # published release (and the rolling build when there is none yet).
            $channel = $StampChannel
            if ($Version -ne '') { $channel = $Version }
            elseif ($Rolling) { $channel = 'latest' }
            if ($channel -eq '') {
                Write-Output "looking for the newest release of $repo"
                try {
                    $newest = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -UseBasicParsing
                    $channel = [string] $newest.tag_name
                }
                catch {
                    # Only "there is none" (404) means the rolling build; no network or a rate limit
                    # stops instead of quietly installing something else.
                    $response = $_.Exception.PSObject.Properties['Response']
                    if ($response -and $response.Value -and [int] $response.Value.StatusCode -eq 404) {
                        Write-Output 'no published release yet: taking the rolling build of main'
                        $channel = 'latest'
                    }
                    else { throw }
                }
            }
            if ($channel -cnotmatch $plain) {
                Stop-Install "the version has a character that is not allowed: $channel"
            }
            if ($channel -eq 'latest') {
                $name = $rollingAsset
            }
            else {
                $name = $releaseAsset.Replace('{version}', ($channel -replace '^v', '')).Replace('{triple}', 'x86_64-pc-windows-msvc')
            }
            if ($name -eq '') { Stop-Install "the channel $channel has no build for Windows" }
            if ($name -cnotmatch $plain) { Stop-Install "the file name is not a plain word: $name" }

            $base = "https://github.com/$repo/releases/download/$channel"
            Write-Output "downloading $name ($channel)"
            $path = Join-Path $work $name
            Invoke-WebRequest -Uri "$base/$name" -OutFile $path -UseBasicParsing
            try {
                Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile (Join-Path $work 'SHA256SUMS') -UseBasicParsing
            }
            catch {
                if ($channel -eq 'latest') {
                    Stop-Install 'SHA256SUMS of the rolling build is missing (a build is running: try again in a few minutes)'
                }
                throw
            }
            $Sums = Join-Path $work 'SHA256SUMS'
        }
        else {
            if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { Stop-Install "no such file: $File" }
            # The full path: a bare name would be checked here but run from the PATH (an old install).
            $path = (Resolve-Path -LiteralPath $File).ProviderPath
        }

        # The checksum: never skipped. A file you have already needs one of the three sources.
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $expected = $Sha256
        if ($expected -eq '') {
            if ($Sums -eq '') {
                $beside = Join-Path (Split-Path -Parent $path) 'SHA256SUMS'
                if (Test-Path -LiteralPath $beside -PathType Leaf) { $Sums = $beside }
            }
            if ($Sums -eq '') { Stop-Install "no checksum for ${path}: give -Sums FILE or -Sha256 HEX" }
            if (-not (Test-Path -LiteralPath $Sums -PathType Leaf)) { Stop-Install "no such file: $Sums" }
            $leaf = Split-Path -Leaf $path
            foreach ($line in Get-Content -LiteralPath $Sums) {
                # Lines are "<hash>  <file>" (or "<hash> *<file>"); the file name must match whole.
                if ($line -match '^([0-9A-Fa-f]{64})\s+\*?(.+)\z' -and $Matches[2] -ceq $leaf) {
                    $expected = $Matches[1]
                    break
                }
            }
            if ($expected -eq '') { Stop-Install "$leaf is not listed in $Sums" }
        }
        if ($actual -ne $expected.ToLowerInvariant()) {
            Stop-Install "the checksum of $path does not match (expected $($expected.ToLowerInvariant()), got $actual): nothing was installed"
        }
        Write-Output 'checksum ok'

        if ($kind -eq 'hub') {
            $exe = $path
            if ($path -like '*.zip') {
                # Every entry must land inside the folder it is unpacked into; checked before anything
                # is written. ExtractToDirectory refuses such a path as well, and throws on any error
                # (Expand-Archive only reports one and goes on).
                $unpacked = Join-Path $work 'unpacked'
                $root = [IO.Path]::GetFullPath($unpacked) + [IO.Path]::DirectorySeparatorChar
                Add-Type -AssemblyName System.IO.Compression.FileSystem
                $zip = [IO.Compression.ZipFile]::OpenRead($path)
                try {
                    foreach ($entry in $zip.Entries) {
                        $target = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $entry.FullName))
                        if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
                            Stop-Install "the archive holds a path that leaves its folder ($($entry.FullName)): nothing was installed"
                        }
                    }
                }
                finally {
                    $zip.Dispose()
                }
                [IO.Compression.ZipFile]::ExtractToDirectory($path, $unpacked)
                $exe = Join-Path $unpacked $program
                if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { Stop-Install "the archive holds no $program" }
            }
            $newVersion = (& $exe --version)
            if ($LASTEXITCODE -ne 0) { Stop-Install 'the program does not run' }
            Write-Output "installing $newVersion"
            # `install` copies the program to its fixed place; its exit status is ours.
            & $exe install @InstallArgs
            if ($LASTEXITCODE -ne 0) { Stop-Install "$program install failed (see above)" }
            Write-Output "installed $newVersion"
        }
        else {
            if ($kind -eq 'nsis') {
                $flags = @('/S')
            }
            else {
                $flags = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/CURRENTUSER', '/NORESTART')
            }
            # Start-Process joins the arguments with spaces: one with a space in it is quoted here.
            foreach ($arg in $InstallArgs) {
                if ($arg -match '\s') { $flags += '"' + $arg + '"' } else { $flags += $arg }
            }
            Write-Output "running the setup silently ($($flags -join ' '))"
            $proc = Start-Process -FilePath $path -ArgumentList $flags -Wait -PassThru
            if ($proc.ExitCode -ne 0) { Stop-Install "the setup failed with exit code $($proc.ExitCode)" }
            Write-Output "installed $app"
        }
    }
    finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
} @args
