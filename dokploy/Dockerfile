# syntax=docker/dockerfile:1.7
#
# Orca Remote Server image.
#
# Orca ships a Linux AppImage, not a server package. This image extracts the
# AppImage at build time and runs `orca serve` without a desktop session, which
# is the configuration Orca's own headless Docker fixtures use
# (config/docker/headless-pairing, config/docker/headless-serve-shutdown).
#
# Only linux/amd64 is covered: the AppImage referenced below is the x64 asset.
# For arm64, change ORCA_APPIMAGE_URL/SHA512 to orca-linux-arm64.AppImage.

ARG UBUNTU_IMAGE=ubuntu@sha256:678c6550cc43645e08669028bc177f50be4e7c5b8cca677067b1914d4afc7a03
FROM ${UBUNTU_IMAGE}

ARG ORCA_VERSION=1.4.239
ARG ORCA_APPIMAGE_SHA512=0Hqinbml/LdjLJlxsWrUGzsV+RvDK0g7zJTkEd6s0hpq9s/DM4lIiuYE8qQ/XjtJDwJfOGB/rfNEG4GO4Et23w==
ARG OPENCODE_VERSION=1.19.4
ARG CLAUDE_CODE_VERSION=2.1.310
ARG CODEX_VERSION=0.164.0
ARG GH_VERSION=2.103.2
ARG GH_SHA256=62ccf747115ddc61237efffdde66a3c8f70ba249433dc64f70801089b59c59c8

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    HOME=/home/orca \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Electron runtime libraries, git/ssh for worktrees, and the CLI tooling agents
# expect. Keep this list aligned with Orca's config/docker/headless-* fixtures.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      fontconfig \
      fonts-dejavu-core \
      git \
      jq \
      less \
      lsof \
      openssh-client \
      openssl \
      procps \
      psmisc \
      python3 \
      tini \
      unzip \
      xz-utils \
      libasound2t64 \
      libatk-bridge2.0-0 \
      libatspi2.0-0 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libsecret-1-0 \
      libx11-xcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxfixes3 \
      libxi6 \
      libxkbcommon0 \
      libxrandr2 \
      libxss1 \
      libxtst6 \
 && rm -rf /var/lib/apt/lists/*

# Node is required by the agent CLIs and by Orca's orcad serve host.
RUN curl -fsSL --retry 5 --retry-delay 3 \
      https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh \
 && bash /tmp/nodesource_setup.sh \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -f /tmp/nodesource_setup.sh \
 && npm install -g --no-fund --no-audit \
      opencode-ai@${OPENCODE_VERSION} \
      @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
      @openai/codex@${CODEX_VERSION} \
 && npm cache clean --force

# GitHub CLI: Orca's PR, checks, issues, and Tasks surfaces call `gh` on the
# runtime host. Pin the binary and verify the published sha256.
RUN set -eux; \
    curl --http1.1 -fsSL --retry 5 --retry-all-errors --retry-delay 3 \
      -o /tmp/gh.tgz \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"; \
    echo "${GH_SHA256}  /tmp/gh.tgz" | sha256sum -c -; \
    tar -xzf /tmp/gh.tgz -C /tmp; \
    install -m 0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh; \
    rm -rf /tmp/gh.tgz "/tmp/gh_${GH_VERSION}_linux_amd64"; \
    git config --system credential.https://github.com.helper '!gh auth git-credential'; \
    gh --version

# Download and verify the AppImage against the sha512 published in the same
# release, then extract it. `--appimage-extract` does not need FUSE.
RUN set -eux; \
    curl --http1.1 -fsSL --retry 8 --retry-all-errors --retry-delay 5 \
      --connect-timeout 30 --max-time 1800 -o /tmp/orca.AppImage \
      "https://github.com/stablyai/orca/releases/download/v${ORCA_VERSION}/orca-linux.AppImage"; \
    CHECKSUM="${ORCA_APPIMAGE_SHA512}" node -e "\
      const crypto = require('crypto');\
      const fs = require('fs');\
      const actual = crypto.createHash('sha512').update(fs.readFileSync('/tmp/orca.AppImage')).digest('base64');\
      const expected = process.env.CHECKSUM;\
      if (actual !== expected) {\
        console.error('AppImage sha512 mismatch: expected ' + expected + ', got ' + actual);\
        process.exit(1);\
      }"; \
    mkdir -p /opt/orca; \
    cd /opt/orca; \
    chmod 0755 /tmp/orca.AppImage; \
    /tmp/orca.AppImage --appimage-extract > /dev/null; \
    mv squashfs-root app; \
    rm -f /tmp/orca.AppImage; \
    test -x /opt/orca/app/AppRun

# Run unprivileged. The whole home directory is a volume so Orca profile data,
# agent credentials, SSH keys, and the orcad Node cache survive redeploys.
RUN useradd --create-home --uid 10001 --shell /bin/bash orca \
 && mkdir -p /repos \
 && chown -R orca:orca /home/orca /repos /opt/orca

COPY --chown=root:root entrypoint.sh /usr/local/bin/orca-entrypoint
COPY --chown=root:root cli-wrapper.sh /usr/local/bin/orca-ide
RUN chmod 0755 /usr/local/bin/orca-entrypoint /usr/local/bin/orca-ide

LABEL org.opencontainers.image.title="orca-server" \
      org.opencontainers.image.description="Headless Orca Remote Server (orca serve) for Dokploy" \
      org.opencontainers.image.source="https://github.com/stablyai/orca" \
      org.opencontainers.image.version="${ORCA_VERSION}" \
      org.opencontainers.image.licenses="MIT"

USER orca
WORKDIR /home/orca

EXPOSE 6768

HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=5 \
  CMD node -e "const net=require('net');const s=net.connect(6768,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(3000,()=>process.exit(1));"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/orca-entrypoint"]
