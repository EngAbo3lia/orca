#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the Orca Remote Server image and optionally pushes it to GHCR.

.DESCRIPTION
    Resolves the requested Orca release, reads the published sha512 for
    orca-linux.AppImage, then builds dokploy/Dockerfile with that version and
    checksum pinned.

.PARAMETER Version
    Orca release version without the leading "v". Defaults to the latest
    non-prerelease release.

.PARAMETER Image
    Target image repository. Defaults to ghcr.io/engabo3lia/orca-server.

.PARAMETER Push
    Push <Image>:<Version> and <Image>:latest after a successful build.

.PARAMETER Pull
    Pull the newest base image layers before building.

.EXAMPLE
    .\build.ps1 -Push

.EXAMPLE
    .\build.ps1 -Version 1.4.239 -Image ghcr.io/engabo3lia/orca-server
#>
[CmdletBinding()]
param(
    [string]$Version,
    [string]$Image = "ghcr.io/engabo3lia/orca-server",
    [switch]$Push,
    [switch]$Pull
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $Version) {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/stablyai/orca/releases/latest" `
        -Headers @{ "User-Agent" = "orca-dokploy-build" }
    $Version = $release.tag_name.TrimStart("v")
    Write-Host "Latest Orca release: $Version"
}

$releaseBase = "https://github.com/stablyai/orca/releases/download/v$Version"
$manifestUrl = "$releaseBase/latest-linux.yml"

Write-Host "Reading release manifest..."
$manifest = Invoke-RestMethod -Uri $manifestUrl -Headers @{ "User-Agent" = "orca-dokploy-build" }
$shaMatch = [regex]::Match($manifest, "(?m)^\s*sha512:\s*(\S+)\s*$")
if (-not $shaMatch.Success) {
    throw "Could not find sha512 in $manifestUrl"
}
$sha512 = $shaMatch.Groups[1].Value

Write-Host "Verifying the AppImage asset is published..."
$head = Invoke-WebRequest -Uri "$releaseBase/orca-linux.AppImage" -Method Head `
    -Headers @{ "User-Agent" = "orca-dokploy-build" } -MaximumRedirection 5
if ($head.StatusCode -ne 200) {
    throw "orca-linux.AppImage for v$Version is not downloadable (HTTP $($head.StatusCode))"
}

$tags = @("$Image`:$Version")
if ($Version -ne "latest") {
    $tags += "$Image`:latest"
}

$buildArgs = @(
    "build",
    "--platform", "linux/amd64",
    "--build-arg", "ORCA_VERSION=$Version",
    "--build-arg", "ORCA_APPIMAGE_SHA512=$sha512"
)
if ($Pull) {
    $buildArgs += "--pull"
}
foreach ($tag in $tags) {
    $buildArgs += @("--tag", $tag)
}
$buildArgs += $scriptDir

Write-Host "Building $($tags -join ', ')..."
& docker @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw "docker build failed with exit code $LASTEXITCODE"
}

if ($Push) {
    foreach ($tag in $tags) {
        Write-Host "Pushing $tag..."
        & docker push $tag
        if ($LASTEXITCODE -ne 0) {
            throw "docker push $tag failed with exit code $LASTEXITCODE"
        }
    }
}

Write-Host ""
Write-Host "Done."
Write-Host "  ORCA_VERSION=$Version"
Write-Host "  ORCA_APPIMAGE_SHA512=$sha512"
Write-Host "  Image: $($tags -join ', ')"
