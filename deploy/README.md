# Docker deployment

This deployment ships Open Design as a single Alpine-based runtime image. The
daemon serves both the API and the built Next.js static export, so there is no
separate nginx container.

## Local compose

```bash
cd deploy
OPEN_DESIGN_IMAGE=ghcr.io/mdominicrq/open-design:latest docker compose pull
OPEN_DESIGN_IMAGE=ghcr.io/mdominicrq/open-design:latest docker compose up -d --no-build
```

If Docker previously cached a single-architecture `latest` image and startup
fails with `exec /sbin/tini: exec format error`, remove the cached tag once and
pull the multi-arch manifest again:

```bash
docker image rm ghcr.io/mdominicrq/open-design:latest
OPEN_DESIGN_IMAGE=ghcr.io/mdominicrq/open-design:latest docker compose pull
```

Defaults:

- Host port: `127.0.0.1:7456` (`OPEN_DESIGN_PORT=8080` to publish on `127.0.0.1:8080`)
- Runtime image: `OPEN_DESIGN_IMAGE`, defaulting to the multi-arch `ghcr.io/mdominicrq/open-design:latest`
- Runtime data volume: `open_design_data` mounted at `/app/.od`
- CLI auth/config volume: `open_design_home` mounted at `/home/open-design`
- Node heap cap: `--max-old-space-size=192`
- Compose memory cap: `1g` (`OPEN_DESIGN_MEM_LIMIT=1536m` to override)
- Version label: bundled app version, or `OPEN_DESIGN_VERSION=<version>` to show a fork/image label in Settings → About

Do not publish the daemon directly on a public or shared LAN interface. The API is
unauthenticated for non-browser clients, so remote deployments should keep Compose
bound to localhost and put an authenticated reverse proxy, SSH tunnel, or VPN in
front of it.

When exposing the service through an authenticated public IP, domain, or reverse
proxy, set `OPEN_DESIGN_ALLOWED_ORIGINS` to the browser origins that should be
allowed to call `/api`:

```bash
OPEN_DESIGN_ALLOWED_ORIGINS=https://od.example.com,http://203.0.113.10:7456 docker compose up -d --no-build
```

Pin a specific published image with a digest instead of the mutable `latest` tag:

```bash
OPEN_DESIGN_IMAGE=ghcr.io/mdominicrq/open-design@sha256:<digest> docker compose up -d --no-build
```
This fork's runtime image bundles Codex CLI, Claude Code, and Gemini CLI. Open
Design only shows a CLI as an installed Local CLI provider after the daemon can
spawn its `--version` probe inside the container. If a CLI is missing from
Settings → Local CLI, check the runtime user first:

```bash
docker compose exec open-design sh -lc 'whoami; command -v codex claude gemini; codex --version; claude --version; gemini --version'
curl http://127.0.0.1:${OPEN_DESIGN_PORT:-7456}/api/agents
```

Authenticate CLIs inside the container so their state is written to the
`open_design_home` volume:

```bash
docker compose exec open-design codex login
docker compose exec open-design claude /login
docker compose exec open-design gemini
```

## Publish to Docker Hub

```bash
deploy/scripts/publish-images.sh --image_tag latest
```

Useful overrides:

```bash
IMAGE_NAMESPACE=your-dockerhub-user deploy/scripts/publish-images.sh --image_tag latest
deploy/scripts/publish-images.sh --image docker.io/your-user/open-design:0.1.0
```

The script defaults to:

- `docker.io/vanjayak/open-design:<tag>`
- `linux/amd64,linux/arm64`
- `skopeo` push strategy with Docker credentials read from `~/.docker/config.json`
- preloading base images through `skopeo` to reduce Docker Hub pull flakiness

If `127.0.0.1:7890` is available and no proxy is already set, the script uses it
for registry access and passes `host.docker.internal:7890` into Docker builds. The
host-gateway alias is only added for builds that need this local proxy mapping.

### Colima swap helper for Apple Silicon

`deploy/scripts/prepare-colima-build-swap.sh` is for manual Docker image
publishing from an Apple Silicon macOS host that uses Colima as the Docker VM.
The helper is intentionally Apple Silicon-only because the failure mode it covers
is local arm64 Colima builds exhausting a small Linux VM while preparing
multi-arch images. It exits before touching Colima on non-macOS or
non-Apple-Silicon hosts.

Low-memory Colima VMs can run out of RAM during multi-arch image builds. The
helper checks the VM memory and swap status, then creates and enables a temporary
swap file only when the VM has no swap and less than 4 GiB of RAM. The 4 GiB
threshold is a conservative default for short-lived manual publishes on small
Colima profiles; raise `COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB` if larger builds
still OOM, or lower it if you only want swap for very small VMs.

Prefer increasing the Colima VM memory (`colima start --memory <GiB>` or the
profile config) when you want a persistent build machine. Use this helper when
you need a temporary, reversible boost for one manual publish without resizing
or recreating the VM.

Run it before a manual publish if Docker builds fail with out-of-memory errors,
or if `status` shows a small Colima VM with no swap. The swap remains active
until cleanup or VM restart, so use a shell trap for one-off sessions:

```bash
deploy/scripts/prepare-colima-build-swap.sh status
deploy/scripts/prepare-colima-build-swap.sh
trap 'deploy/scripts/prepare-colima-build-swap.sh cleanup' EXIT
deploy/scripts/publish-images.sh --image_tag latest
```

Useful overrides:

```bash
COLIMA_BUILD_SWAP_SIZE=6G deploy/scripts/prepare-colima-build-swap.sh
COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB=6291456 deploy/scripts/prepare-colima-build-swap.sh
COLIMA_BIN=/opt/homebrew/bin/colima deploy/scripts/prepare-colima-build-swap.sh status
COLIMA_BUILD_SWAP_CLEANUP_FORCE=1 COLIMA_BUILD_SWAPFILE=/custom-swapfile deploy/scripts/prepare-colima-build-swap.sh cleanup
```

`cleanup` removes the default helper path and the old helper path. If you set a
custom `COLIMA_BUILD_SWAPFILE`, cleanup refuses to remove it unless
`COLIMA_BUILD_SWAP_CLEANUP_FORCE=1` is also set.
