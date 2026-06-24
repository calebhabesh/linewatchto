# Remote Production Image Builds Design

Date: 2026-06-19

## Context

LineWatchTO currently builds its production frontend, backend, and PostGIS
images on the Oracle Cloud Ampere VPS through `docker compose up --build`. The
VPS has enough memory to run the application, but image builds add avoidable CPU,
memory, disk, and deployment-time load.

The development server has substantially stronger hardware. Production releases
should therefore be built there and transferred through a container registry.
Deployment must remain an explicit operator action rather than occurring on
every push to `main`.

## Goals

- Build production images on the development server.
- Publish native `linux/arm64` images for the Oracle Ampere VPS.
- Deploy immutable, Git-addressable image versions.
- Keep Maven, npm, and Docker build load off the production VPS.
- Keep deployment and rollback explicit and understandable.
- Avoid storing registry credentials on the VPS.
- Preserve all existing production volumes and host-managed WireGuard access.

## Non-Goals

- Automatic deployment after pushes or merges.
- A self-hosted GitHub Actions runner.
- Multi-node orchestration, blue/green deployment, or Kubernetes.
- Automatic database migration rollback.
- Building or publishing `linux/amd64` production images.
- Moving application secrets into GitHub or GHCR.

## Selected Approach

Use the development server to build three ARM64 OCI images with Docker Buildx,
then push them to public GitHub Container Registry packages:

- `ghcr.io/calebhabesh/linewatch-frontend`
- `ghcr.io/calebhabesh/linewatch-backend`
- `ghcr.io/calebhabesh/linewatch-postgres`

The VPS pulls those images anonymously and runs them through the existing
production Compose stack. Caddy and Redis continue to use their upstream public
images.

The alternatives were rejected for this phase:

- Copying image archives over SSH avoids a registry but makes transfers,
  cleanup, release history, and rollback less reliable.
- GitHub Actions could build images, but the selected requirement is to use the
  stronger development server and keep releases manually controlled.

## Image Identity

Every build uses the full 40-character Git commit SHA as its immutable tag. For
example:

```text
ghcr.io/calebhabesh/linewatch-frontend:0123456789abcdef0123456789abcdef01234567
ghcr.io/calebhabesh/linewatch-backend:0123456789abcdef0123456789abcdef01234567
ghcr.io/calebhabesh/linewatch-postgres:0123456789abcdef0123456789abcdef01234567
```

All three images in a release use the same tag. Production Compose never
deploys `latest` or another floating tag. The build command may optionally
publish a human-friendly alias such as `production`, but deployment and rollback
must always use the immutable commit tag.

Images include OCI source and revision metadata linking them to:

```text
https://github.com/calebhabesh/ttc-reliability-navigator
```

## Registry Access

The development server authenticates to `ghcr.io` using a GitHub personal
access token (classic) with `write:packages`. The token is supplied through
standard input to `docker login`; it is never committed or accepted as a script
argument.

GHCR creates command-line-published packages as private initially. After the
first successful publish, the operator must:

1. Link each package to the GitHub repository if the OCI source label has not
   linked it automatically.
2. Change each package visibility to public.
3. Confirm an unauthenticated `docker pull` succeeds.

Once public, the production VPS does not need a GitHub token or Docker registry
login.

## Development-Server Build Flow

A repository script provides one release-build command. It:

1. Verifies the worktree is clean.
2. Resolves the full Git commit SHA.
3. Verifies Docker, Buildx, a reachable Docker daemon, and GHCR authentication.
4. Creates or reuses a Buildx builder capable of `linux/arm64` output.
5. Builds the frontend, backend, and PostGIS images for `linux/arm64`.
6. Passes the commit SHA into frontend build metadata.
7. Pushes all images under the same immutable tag.
8. Prints the exact VPS deployment command.

Cross-compilation uses Buildx/QEMU when the development server is `amd64`. A
native ARM64 development server can use the same command without changing the
release contract.

Publishing is not deployment. If one image fails to build or push, the script
returns non-zero and no VPS command runs. Partially published images are harmless
because deployment first verifies that the full image set can be pulled.

## Production Compose Contract

`docker-compose.prod.yml` uses image references instead of local build
definitions for:

- `postgres`
- `backend`
- `frontend`

The tag comes from a required `LINEWATCH_IMAGE_TAG` interpolation variable.
The registry namespace defaults to `ghcr.io/calebhabesh` but can be overridden
for testing.

Production image selection lives in a server-local `.env.release` file:

```dotenv
LINEWATCH_IMAGE_REGISTRY=ghcr.io/calebhabesh
LINEWATCH_IMAGE_TAG=0123456789abcdef0123456789abcdef01234567
```

`.env.production` remains the secret and runtime-configuration file.
`.env.release` contains no secrets, but remains server-local because it records
the currently selected release. Production Compose commands load both files.

The `NEXT_PUBLIC_LINEWATCH_APP_VERSION` and
`NEXT_PUBLIC_LINEWATCH_BUILD_LABEL` values are build-time inputs. They move out
of `.env.production`; the development-server build script owns them.

## VPS Deployment Flow

A deployment script takes one full Git SHA:

```bash
scripts/prod-deploy.sh 0123456789abcdef0123456789abcdef01234567
```

It:

1. Requires `.env.production`.
2. Validates the tag as a full 40-character hexadecimal SHA.
3. Records the previously deployed tag when one exists.
4. Creates a candidate release env file without replacing `.env.release`.
5. Pulls the complete frontend, backend, and PostGIS image set.
6. Runs Compose with `--no-build`, preserving named volumes.
7. Waits for service health checks.
8. Promotes the candidate file to `.env.release` only after success.
9. Prints service state and the public smoke-test command.

The script never invokes Docker builds on the VPS. It also never prunes images
or volumes automatically.

Before a normal update, the operator should create a PostgreSQL backup with the
existing backup script. The first deployment is exempt because no production
database container exists yet.

## Failure And Rollback

If an image cannot be pulled, deployment stops before Compose changes running
containers.

If container startup or health checks fail, the candidate tag is not recorded
as the current release. The script prints diagnostics and the previous immutable
tag. Rollback is an explicit deployment of that tag:

```bash
scripts/prod-deploy.sh <previous-full-git-sha>
```

An application rollback does not reverse Flyway migrations. Before rolling back
across a release containing schema changes, the operator must confirm the older
application remains compatible with the migrated schema or restore the
pre-deployment database backup.

## Operator Commands

The normal release flow is:

```bash
# Development server
scripts/prod-build-push.sh

# Production VPS over WireGuard SSH
git pull --ff-only
scripts/prod-backup-postgres.sh
scripts/prod-deploy.sh <full-git-sha>
```

A small Compose wrapper loads `.env.production` and `.env.release` for routine
commands such as:

```bash
scripts/prod-compose.sh ps
scripts/prod-compose.sh logs -f caddy frontend backend
```

The repository checkout is still required on the VPS for Compose, Caddy, scripts,
and documentation, but it no longer needs the frontend or backend build
toolchains.

## Verification

Implementation is complete when:

- Shell tests cover tag validation, clean-worktree checks, generated image
  references, and release-file promotion behavior.
- Production Compose rejects a missing image tag.
- Rendered Compose contains GHCR images for frontend, backend, and PostGIS.
- Rendered Compose contains no production `build:` definitions.
- Build scripts pass `bash -n` and shell tests.
- Existing backend and frontend verification still passes where affected.
- ARM64 images can be built and pushed from a Buildx-enabled development server.
- Image manifests report `linux/arm64`.
- Public images can be pulled without GHCR authentication.
- An isolated Compose smoke test reaches healthy frontend, backend, PostGIS, and
  Redis services using the published images.
- Re-deploying an older commit tag restores the prior application image set
  without changing named volumes.

Registry publication and the live VPS deployment require operator credentials
and are documented verification steps when they cannot run in the development
workspace.

## Documentation Changes

Implementation updates:

- `README.md`
- `docs/production-vps.md`
- `.env.production.example`
- `AGENTS.md`
- `GEMINI.md`

The documentation must clearly distinguish build-time image metadata,
server-local runtime secrets, and server-local release selection.

## References

- GitHub Container Registry authentication, visibility, image labels, and pulls:
  <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry>
- Docker Buildx multi-platform builds:
  <https://docs.docker.com/build/building/multi-platform/>
