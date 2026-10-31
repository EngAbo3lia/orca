#Requires -Version 5.1
<#
.SYNOPSIS
    Provisions the Cloudflare side of orca.majra.dev: DNS CNAME, tunnel
    ingress route, and (optionally) a Cloudflare Access application.

.DESCRIPTION
    Uses CLOUDFLARE_API_TOKEN from the environment. The token needs:
      Zone:Read, DNS:Edit            (DNS record)
      Account: Cloudflare Tunnel:Edit (tunnel ingress)
      Account: Access: Apps and Policies:Edit (only when Access is created)

    IMPORTANT — Cloudflare Access and Orca native clients
    Orca's desktop and mobile clients open a WebSocket and authenticate with a
    pairing token inside an end-to-end encrypted handshake. They cannot answer
    an interactive Cloudflare Access login. An Access policy in front of this
    host therefore gates the browser web client only; desktop/mobile pairing
    through the same hostname will fail unless those devices reach the origin
    over Tailscale/WARP or a local `cloudflared access tcp` tunnel.

    Read dokploy/README.md before enabling Access.

.PARAMETER Hostname
    Public hostname. Defaults to orca.majra.dev.

.PARAMETER Emails
    Operator email addresses allowed through Access. Required unless
    -SkipAccess is used.

.PARAMETER SkipAccess
    Only create the DNS record and tunnel route.

.PARAMETER SkipDns
    Do not touch DNS.

.PARAMETER SkipTunnel
    Do not touch tunnel ingress.

.PARAMETER WhatIf
    Print planned changes without writing anything.

.EXAMPLE
    .\cloudflare-access.ps1 -WhatIf

.EXAMPLE
    .\cloudflare-access.ps1 -Emails "ops@aboalia.com"

.EXAMPLE
    .\cloudflare-access.ps1 -SkipAccess
#>
[CmdletBinding()]
param(
    [string]$Hostname = "orca.majra.dev",
    [string]$ZoneName = "majra.dev",
    [string[]]$Emails = @(),
    [switch]$SkipAccess,
    [switch]$SkipDns,
    [switch]$SkipTunnel,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$AccountId = "a05c89361b3d4b3cd7b3a6c8dc6115f5"
$TunnelId = "86a1bedb-1138-478f-b0e6-fcfa98c5b9af"
$TunnelTarget = "http://192.168.8.200:80"
$TunnelCname = "$TunnelId.cfargotunnel.com"

$token = $env:CLOUDFLARE_API_TOKEN
if (-not $token) {
    $token = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "User")
}
if (-not $token) {
    throw "CLOUDFLARE_API_TOKEN is not set (process or user scope)."
}

$api = "https://api.cloudflare.com/client/v4"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("orca-cf-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tempDir | Out-Null

function Invoke-CfApi {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body
    )

    $args = @(
        "-sS", "--max-time", "30", "--retry", "5", "--retry-delay", "3",
        "--retry-all-errors",
        "-X", $Method,
        "-H", "Authorization: Bearer $token",
        "-H", "Content-Type: application/json"
    )

    if ($null -ne $Body) {
        $bodyFile = Join-Path $tempDir ([guid]::NewGuid().ToString() + ".json")
        [System.IO.File]::WriteAllText(
            $bodyFile,
            ($Body | ConvertTo-Json -Depth 20),
            (New-Object System.Text.UTF8Encoding($false))
        )
        $args += @("--data", "@$bodyFile")
    }

    $args += "$api$Path"
    $raw = & curl.exe @args
    if ($LASTEXITCODE -ne 0) {
        throw "Cloudflare API call failed ($Method $Path): curl exit $LASTEXITCODE"
    }

    $parsed = $raw | ConvertFrom-Json
    if (-not $parsed.success) {
        $message = ($parsed.errors | ForEach-Object { "$($_.code): $($_.message)" }) -join "; "
        throw "Cloudflare API error ($Method $Path): $message"
    }
    return $parsed
}

try {
    Write-Host "Resolving zone $ZoneName..."
    $zones = Invoke-CfApi -Method GET -Path "/zones?name=$ZoneName"
    if (-not $zones.result -or $zones.result.Count -eq 0) {
        throw "Zone $ZoneName not found for this token."
    }
    $zoneId = $zones.result[0].id
    Write-Host "  zone id: $zoneId"

    if (-not $SkipDns) {
        Write-Host "Ensuring DNS CNAME $Hostname -> $TunnelCname..."
        $records = Invoke-CfApi -Method GET -Path "/zones/$zoneId/dns_records?name=$Hostname"
        $desired = [ordered]@{
            type    = "CNAME"
            name    = $Hostname
            content = $TunnelCname
            proxied = $true
            ttl     = 1
        }
        if ($records.result.Count -eq 0) {
            if ($WhatIf) {
                Write-Host "  [WhatIf] create CNAME $Hostname -> $TunnelCname"
            } else {
                Invoke-CfApi -Method POST -Path "/zones/$zoneId/dns_records" -Body $desired | Out-Null
                Write-Host "  created"
            }
        } else {
            $record = $records.result[0]
            $current = [ordered]@{
                type    = $record.type
                name    = $record.name
                content = $record.content
                proxied = $record.proxied
                ttl     = $record.ttl
            }
            if (($current | ConvertTo-Json -Compress) -ne ($desired | ConvertTo-Json -Compress)) {
                if ($WhatIf) {
                    Write-Host "  [WhatIf] update record $($record.id) to CNAME $TunnelCname (proxied)"
                } else {
                    Invoke-CfApi -Method PUT -Path "/zones/$zoneId/dns_records/$($record.id)" -Body $desired | Out-Null
                    Write-Host "  updated"
                }
            } else {
                Write-Host "  already correct"
            }
        }
    }

    if (-not $SkipTunnel) {
        Write-Host "Ensuring tunnel ingress for $Hostname..."
        $configResponse = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/cfd_tunnel/$TunnelId/configurations"
        $config = $configResponse.result.config
        if ($null -eq $config) {
            throw "Tunnel $TunnelId has no configuration."
        }

        $ingress = @($config.ingress)
        $existing = $ingress | Where-Object { $_.hostname -eq $Hostname }
        if ($existing) {
            if ($existing.service -ne $TunnelTarget) {
                throw "Tunnel already routes $Hostname to $($existing.service); refusing to overwrite. Edit the tunnel configuration manually."
            }
            Write-Host "  already routed to $TunnelTarget"
        } else {
            $catchAll = $ingress | Where-Object { -not $_.hostname } | Select-Object -Last 1
            if (-not $catchAll) {
                throw "Tunnel configuration has no catch-all rule; refusing to guess."
            }
            $route = [ordered]@{
                hostname = $Hostname
                service  = $TunnelTarget
            }
            $newIngress = @()
            foreach ($rule in $ingress) {
                if ($rule -eq $catchAll) {
                    $newIngress += $route
                }
                $newIngress += $rule
            }
            $newConfig = [ordered]@{}
            foreach ($property in $config.PSObject.Properties) {
                $newConfig[$property.Name] = $property.Value
            }
            $newConfig["ingress"] = $newIngress

            if ($WhatIf) {
                Write-Host "  [WhatIf] add ingress $Hostname -> $TunnelTarget (before catch-all)"
            } else {
                Invoke-CfApi -Method PUT -Path "/accounts/$AccountId/cfd_tunnel/$TunnelId/configurations" `
                    -Body @{ config = $newConfig } | Out-Null
                Write-Host "  route added"
            }
        }
    }

    if (-not $SkipAccess) {
        if ($Emails.Count -eq 0) {
            throw "Pass -Emails when creating Access, or use -SkipAccess."
        }

        Write-Host "Ensuring Cloudflare Access application for $Hostname..."
        $apps = Invoke-CfApi -Method GET -Path "/accounts/$AccountId/access/apps?domain=$Hostname"
        if ($apps.result.Count -gt 0) {
            Write-Host "  application already exists: $($apps.result[0].id)"
        } else {
            $include = @($Emails | ForEach-Object { @{ email = @{ email = $_ } } })
            $appBody = [ordered]@{
                name                 = "Orca Remote Server"
                domain               = $Hostname
                type                 = "self_hosted"
                session_duration     = "24h"
                app_launcher_visible = $false
                policies             = @(
                    [ordered]@{
                        name       = "Allow operators"
                        decision   = "allow"
                        precedence = 1
                        include    = $include
                    }
                )
            }
            if ($WhatIf) {
                Write-Host "  [WhatIf] create Access app with allow policy for: $($Emails -join ', ')"
            } else {
                $created = Invoke-CfApi -Method POST -Path "/accounts/$AccountId/access/apps" -Body $appBody
                Write-Host "  created: $($created.result.id)"
            }
        }
        Write-Host ""
        Write-Host "Note: Access blocks Orca's native WebSocket pairing login."
        Write-Host "      Browser web client only, unless clients reach the origin over"
        Write-Host "      Tailscale/WARP or a local cloudflared access tunnel."
    }

    Write-Host ""
    Write-Host "Cloudflare provisioning complete."
    Write-Host "Next: create the Dokploy domain rule (service server, port 6768, https false)"
    Write-Host "and deploy the compose file."
}
finally {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
