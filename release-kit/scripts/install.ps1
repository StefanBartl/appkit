<#
.SYNOPSIS
Install an app for the current user on Windows, without administrator rights (release-kit of appkit).

.DESCRIPTION
Downloads the Windows build of the app from its GitHub release, checks it against the SHA256SUMS of
that release, and installs it in the way the app is built:

  hub    a program with its own `install` command (a .zip with the program, or the bare program):
         runs `<program> install`, which copies it to its fixed place
  nsis   an NSIS setup: runs it silently (/S), for the current user
  inno   an Inno Setup: runs it silently (/VERYSILENT /SUPPRESSMSGBOXES /CURRENTUSER /NORESTART)

A file this script downloads carries no Mark-of-the-Web, so SmartScreen does not stop the setup: the
checksum is what is checked instead, and nothing runs when it does not match.

The copy attached to a release is stamped by the release workflow: it knows its repository, its app
and its channel (the release it came with, or the rolling build `latest`) and runs without
parameters, also through Invoke-Expression:

  powershell -ExecutionPolicy Bypass -c "irm https://github.com/OWNER/NAME/releases/download/latest/install.ps1 | iex"

Run it in your own PowerShell, not elevated: the apps install for one user, and an elevated session
belongs to the administrator account, whose profile would get the app.

.PARAMETER Version
A release tag to install instead of the channel of this copy.

.PARAMETER Rolling
Install the rolling build of main (the pre-release `latest`) instead of the channel of this copy.

.PARAMETER File
A build you already have: nothing is downloaded. The checksum then comes from -Sums, -Sha256 or a
SHA256SUMS file next to it.

.PARAMETER Sums
A SHA256SUMS file ("<hash>  <file>" per line).

.PARAMETER Sha256
The expected SHA-256 of the file.

.PARAMETER InstallArgs
More arguments for the install step (`<program> install ...` or the setup), e.g. '--autostart'.

.PARAMETER AllowElevated
Install although the session is elevated (a build machine; the app is then installed for the
administrator account).

.PARAMETER Repo
.PARAMETER App
.PARAMETER Kind
.PARAMETER Program
.PARAMETER ReleaseAsset
.PARAMETER RollingAsset
What the release workflow stamps into this copy; given here, they win (for a copy that is not stamped).
`ReleaseAsset` may hold {version} (the tag without its v) and {triple} (x86_64-pc-windows-msvc).

.EXAMPLE
.\install.ps1 -InstallArgs '--autostart'
#>
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

# A block of its own: run through Invoke-Expression, the strict mode and the error preference stay
# here and never change the session of the person who runs it.
& {
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
    if ($app -notmatch '^[A-Za-z0-9._-]+$') { Stop-Install "-App must be a plain word: $app" }
    if (@('hub', 'nsis', 'inno') -notcontains $kind) {
        Stop-Install "-Kind must be hub, nsis or inno (this copy is not stamped: give -Kind and the rest)"
    }
    if ($kind -eq 'hub' -and $program -notmatch '^[A-Za-z0-9._-]+$') {
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
        $path = $File
        if ($path -eq '') {
            if ($repo -notmatch '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$') {
                Stop-Install '-Repo must be OWNER/NAME (this copy is not stamped)'
            }
            if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
                Stop-Install "no build for Windows on $env:PROCESSOR_ARCHITECTURE"
            }
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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
                    if ($_.Exception.Response -and [int] $_.Exception.Response.StatusCode -eq 404) {
                        Write-Output 'no published release yet: taking the rolling build of main'
                        $channel = 'latest'
                    }
                    else { throw }
                }
            }
            # A tag is a plain word: it goes into a URL and a file name.
            if ($channel -notmatch '^[A-Za-z0-9._-]+$') {
                Stop-Install "the version has a character that is not allowed: $channel"
            }
            if ($channel -eq 'latest') {
                $name = $rollingAsset
            }
            else {
                $name = $releaseAsset.Replace('{version}', $channel.TrimStart('v')).Replace('{triple}', 'x86_64-pc-windows-msvc')
            }
            if ($name -eq '') { Stop-Install "the channel $channel has no build for Windows" }
            if ($name -notmatch '^[A-Za-z0-9._-]+$') { Stop-Install "the file name is not a plain word: $name" }

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
        elseif (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Stop-Install "no such file: $path"
        }

        # The checksum: never skipped. A file you have already needs one of the three sources.
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $expected = $Sha256
        if ($expected -eq '') {
            if ($Sums -eq '') {
                $beside = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $path)) 'SHA256SUMS'
                if (Test-Path -LiteralPath $beside -PathType Leaf) { $Sums = $beside }
            }
            if ($Sums -eq '') { Stop-Install "no checksum for ${path}: give -Sums FILE or -Sha256 HEX" }
            if (-not (Test-Path -LiteralPath $Sums -PathType Leaf)) { Stop-Install "no such file: $Sums" }
            $leaf = Split-Path -Leaf $path
            foreach ($line in Get-Content -LiteralPath $Sums) {
                # Lines are "<hash>  <file>" (or "<hash> *<file>"); the file name must match whole.
                if ($line -match '^([0-9A-Fa-f]{64})\s+\*?(.+)$' -and $Matches[2] -eq $leaf) {
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
                # A path that leaves the folder it is unpacked into is refused before anything is
                # written (the Expand-Archive of Windows PowerShell 5.1 does not look).
                Add-Type -AssemblyName System.IO.Compression.FileSystem
                $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $path).Path)
                try {
                    foreach ($entry in $zip.Entries) {
                        if ($entry.FullName -match '(^|[\\/])\.\.([\\/]|$)' -or [IO.Path]::IsPathRooted($entry.FullName)) {
                            Stop-Install "the archive holds a path that leaves its folder ($($entry.FullName)): nothing was installed"
                        }
                    }
                }
                finally {
                    $zip.Dispose()
                }
                $unpacked = Join-Path $work 'unpacked'
                Expand-Archive -LiteralPath $path -DestinationPath $unpacked
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
            $flags += $InstallArgs
            Write-Output "running the setup silently ($($flags -join ' '))"
            $proc = Start-Process -FilePath $path -ArgumentList $flags -Wait -PassThru
            if ($proc.ExitCode -ne 0) { Stop-Install "the setup failed with exit code $($proc.ExitCode)" }
            Write-Output "installed $app"
        }
    }
    finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
