# Orca Remote Server on Dokploy

Headless Orca runtime (`orca serve`) packaged for Dokploy, serving
`orca.majra.dev`.

Upstream repository: `https://github.com/stablyai/orca` (cloned at `e18752ac`,
release pinned to `v1.4.239`).

## What runs, and what does not

| Orca component | Runs here | Why |
| --- | --- | --- |
| Desktop app (Electron GUI) | No | Needs a desktop session. |
| `cloud/apps/relay` | No | Requires Google OIDC issuer, JWKS, IAM service accounts, and the private `stablyai/orca-cloud` deployment configuration. Desktop clients trust Orca's issuer, so a self-hosted relay would reject their tokens. |
| `orca serve` | **Yes** | Headless Linux runtime. Orca's own Docker fixtures (`config/docker/headless-pairing`, `headless-serve-shutdown`) run the AppImage this way. |

This image extracts the official `orca-linux.AppImage`, verifies its published
sha512, installs the Electron runtime libraries, and starts:

```
orca serve --port 6768 --pairing-address wss://orca.majra.dev
```

The server binds `0.0.0.0` (Orca's orcad default) and speaks plain HTTP/WebSocket
on `6768`; TLS terminates at Cloudflare.

## Files

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builds the server image from the pinned AppImage. |
| `entrypoint.sh` | Builds the `orca serve` command line from environment variables. |
| `cli-wrapper.sh` | `orca-ide` wrapper for `docker exec` (Linux CLI name). |
| `docker-compose.dokploy.yml` | Image-only Dokploy compose (normal deploy path). |
| `docker-compose.build.yml` | Variant that builds inside Dokploy (no GHCR). |
| `.env.example` | Environment template. |
| `build.ps1` | Resolves release + sha512, builds, optionally pushes to GHCR. |
| `github-workflows/build-orca-server.yml` | CI variant of the build. |
| `cloudflare-access.ps1` | DNS CNAME + tunnel ingress + optional Access app. |

## 1. Build and publish the image

On a machine with Docker:

```powershell
cd D:\Aboalia\Orca\dokploy
.\build.ps1 -Push
```

The script reads `latest-linux.yml` for the release, verifies the AppImage
sha512, builds `linux/amd64`, and pushes:

```
ghcr.io/engabo3lia/orca-server:1.4.239
ghcr.io/engabo3lia/orca-server:latest
```

To pin a specific release:

```powershell
.\build.ps1 -Version 1.4.239 -Push
```

For CI, copy `github-workflows/build-orca-server.yml` to
`.github/workflows/build-orca-server.yml` in the repository Dokploy uses.

To build directly on the Dokploy host instead, use
`docker-compose.build.yml`. It downloads the AppImage and installs the agent
CLIs on every deploy, so the prebuilt image is the normal path.

## 2. Create the Dokploy compose

The compose file needs a Git source. Either:

- fork `stablyai/orca` to `EngAbo3lia/orca` and keep the `dokploy/` directory, or
- create a small deployment repository that contains only `dokploy/`.

In Dokploy:

1. Create a project/environment (the existing `Standalone - Projects` project
   fits) and add a **Compose** service.
2. Provider: GitHub. Repository: the fork/deployment repo. Branch: `main`.
3. Compose path: `dokploy/docker-compose.dokploy.yml`.
4. Environment:

```
REGISTRY=ghcr.io/engabo3lia
APP_VERSION=1.4.239
ORCA_PAIRING_ADDRESS=wss://orca.majra.dev
TZ=Africa/Cairo
GIT_AUTHOR_NAME=Orca Agent
GIT_AUTHOR_EMAIL=orca@majra.dev
```

5. If the GHCR package is private, add a token with `read:packages` under
   **Settings → Registry**.
6. Deploy.

The container is named `orca_server`; volumes `orca_home` and `orca_repos`
survive redeploys.

## 3. Domain and Cloudflare

Dokploy domain rule (this is important — behind the tunnel the origin must stay
plain HTTP):

```
host:              orca.majra.dev
path:              /
port:              6768
serviceName:       server
https:             false
certificateType:   none
```

Then either run the provisioning script:

```powershell
cd D:\Aboalia\Orca\dokploy
.\cloudflare-access.ps1 -Emails "ops@aboalia.com"
```

or do it manually:

- DNS: `CNAME orca.majra.dev → 86a1bedb-1138-478f-b0e6-fcfa98c5b9af.cfargotunnel.com`,
  proxied.
- Tunnel **Aboalia Server** ingress: `orca.majra.dev → http://192.168.8.200:80`
  (Traefik), inserted before the catch-all.
- Access: see the warning below.

After changing DNS or ingress, redeploy the compose so Dokploy writes the
Traefik labels, and confirm the container was actually recreated (uptime reset).

### Warning: Cloudflare Access versus the native client

Orca's desktop and mobile clients authenticate with a pairing token inside an
end-to-end encrypted WebSocket handshake. They cannot complete an interactive
Cloudflare Access login. Consequences:

| Client | Through Access |
| --- | --- |
| Browser web client (Orca prints a browser URL at startup) | Works; the Access cookie is sent with the WebSocket upgrade. |
| Orca desktop app | Fails at the Access redirect. |
| Orca mobile app | Fails at the Access redirect. |

Choose one:

1. **Access enabled** — use the browser web client only, or reach the origin from
   desktop/mobile over Tailscale/WARP or a local
   `cloudflared access tcp --hostname orca.majra.dev --url 127.0.0.1:6768`
   tunnel.
2. **Access disabled** (`-SkipAccess`, and no Access app on the hostname) — the
   runtime is publicly reachable and protected only by Orca's pairing token and
   end-to-end encryption. Orca's documentation explicitly advises against
   exposing this port to the public internet. If you take this path, add a
   Cloudflare WAF rate-limit rule on the hostname and rotate grants if a pairing
   link leaks.

Do not treat Access as a transparent gate for the desktop app.

## 4. First start

The first start may download Orca's pinned Node runtime for orcad; the download
is cached in the `orca_home` volume. Startup can take a few minutes. Then:

```
deployment.allByCompose → compose.readLogs
```

or on the host:

```bash
docker logs --tail 200 orca_server
```

Look for the bound endpoint, the pairing link (`orca://pair?code=...`), and, when
available, a browser URL with the pairing data embedded.

Paste the link into **Settings → Remote Orca Servers → Add Server** on the
desktop client, or into Orca Mobile.

To issue another pairing link later, restart the container; existing device
grants are stored in the volume and stay valid. Revoke a grant from the client
that owns the runtime (`Shared Server Access`) or by deleting the device record
inside `orca_home`.

## 5. Repositories and credentials

Everything under `/home/orca` persists. Repositories live in `/repos`.

```bash
docker exec -it orca_server bash

# Repositories
cd /repos
git clone git@github.com:EngAbo3lia/SAP.BusinessOne.POS.git

# Register the checkout with Orca
orca-ide repo add --path /repos/SAP.BusinessOne.POS
orca-ide repo list --json

# SSH key for private clones
ssh-keygen -t ed25519 -C "orca@majra.dev"
cat ~/.ssh/id_ed25519.pub

# Agent logins (browser/device flow where supported)
opencode auth login
claude
codex login
```

`orca-ide` is the Linux name of the bundled CLI. Agents launched from Orca use
the container's `PATH`, home directory, and credentials, not the client laptop's.

GitHub over HTTPS uses a credential helper stored in `~/.git-credentials`
(plaintext inside the volume). SSH keys are preferred.

## 6. Verification

```bash
# Health
docker inspect --format '{{.State.Health.Status}}' orca_server

# Runtime is listening
docker exec orca_server node -e "require('net').connect(6768,'127.0.0.1',()=>process.exit(0))"

# Traefik router exists (from the LAN). A Traefik 404 means no router.
curl -i -H "Host: orca.majra.dev" http://192.168.8.200/

# Public edge
curl -I https://orca.majra.dev
```

With Access enabled, `curl -I https://orca.majra.dev` returns a `302` to the
Access login. Without Access, it reaches Orca directly.

Then pair a real client and open a terminal in a worktree. Do not mark the
deployment complete from a page load alone.

## 7. Updates and backups

Update: build and push a new image tag, set `APP_VERSION` in Dokploy, redeploy,
and confirm the container was recreated. Orca's orcad serve host has no
self-updater, so the image tag is the only upgrade path.

Rollback: set `APP_VERSION` back to the previous tag and redeploy.

Backup the profile and credentials:

```bash
docker run --rm \
  -v orca_orca_home:/data:ro \
  -v /srv/backups:/backup \
  alpine tar czf /backup/orca-home-$(date +%F).tgz -C /data .
```

Back up `orca_repos` the same way if repositories are not pushed elsewhere.

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Container exits immediately | `ORCA_PAIRING_ADDRESS` missing | Set it in Dokploy environment. |
| `Serve is already running for this profile` (exit 3) | A second server uses the same `orca_home` | Run one server per profile. Remove duplicate replicas. |
| Startup takes minutes | orcad downloading its pinned Node | Wait; allow egress; the cache lands in the volume. |
| Traefik `404` for the hostname | No router, wrong port, or container not recreated | Check the domain rule (`server`, `6768`), redeploy until uptime resets. |
| Cloudflare `502` | Traefik or the container is down | Check `docker.getContainers`, then redeploy. |
| Pairing fails with a protocol error | Client and server versions differ | Update the desktop/mobile client to match the pinned release. |
| Desktop cannot pair while the browser works | Access is intercepting the native client | Use option 1 or 2 in section 3. |
| SSH clone prompts for a password | No key or agent in the container | Generate a key in `~/.ssh` and add it to GitHub. |
| OOM-killed during agent work | 6 GB limit too small for parallel agents and Chromium | Raise the compose limit. |

## 9. Moving this to another laptop

Everything needed to build and deploy is inside `dokploy/`. The Orca source
clone is not required at build time: `Dockerfile` downloads the pinned AppImage
from GitHub.

On another machine:

1. Copy the whole `dokploy/` directory (or clone the repository that contains
   it).
2. Install Docker Desktop or Docker Engine with Compose v2.
3. Run `build.ps1` (PowerShell) or the equivalent `docker build` from the
   `dokploy/` directory.
4. Deploy the same compose file in Dokploy.

The scripts resolve paths relative to their own location. Adjust the example
paths in this README (`D:\Aboalia\Orca\dokploy`) to wherever the folder landed.

Portable minimum set:

```
Dockerfile
entrypoint.sh
cli-wrapper.sh
docker-compose.dokploy.yml
docker-compose.build.yml     (optional)
.env.example
build.ps1                    (Windows build helper)
cloudflare-access.ps1        (optional Cloudflare provisioning)
README.md
.dockerignore
```

## Security notes

- The container has its own filesystem but no Docker socket and no host mounts
  by default. Agents can only touch `/home/orca` and `/repos`.
- `--no-sandbox` is set because Chromium's setuid sandbox is unavailable in an
  unprivileged container. The container boundary is the isolation layer.
- Treat a pairing link as a shell on this container.
- Keep only the repositories and credentials this runtime actually needs.
