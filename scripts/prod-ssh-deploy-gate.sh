#!/usr/bin/env bash
# Forced command for the GitHub Actions deploy key on the production VPS.
#
# Install a root-owned copy (not the checkout's, which a deploy rewrites) and pin the key to it:
#   sudo install -m 755 scripts/prod-ssh-deploy-gate.sh /usr/local/sbin/linewatch-deploy-gate
#   command="/usr/local/sbin/linewatch-deploy-gate",from="10.0.0.3",restrict ssh-ed25519 ...
#
# The workflow still sends `bash -c '<runner>' bash SHA PATH [FRONTEND BACKEND POSTGRES]` with
# the release script on stdin. The gate discards that script, keeps only the arguments, and runs
# prod-remote-release.sh as committed on origin/main, so the key can only deploy main commits.
set -euo pipefail

ROOT_DIR="${LINEWATCH_DEPLOY_GATE_ROOT:-/home/ubuntu/apps/linewatchto}"
GIT_BIN="${GIT_BIN:-git}"

die() {
  printf 'deploy gate: %s\n' "$*" >&2
  exit 1
}

# Drain the client's script so the sender does not block, then ignore it.
cat > /dev/null || true

read -r -a words <<< "${SSH_ORIGINAL_COMMAND:-}"
args=()
for ((i = ${#words[@]} - 1; i >= 0; i--)); do
  if [[ "${words[i]}" == "bash" ]]; then
    args=("${words[@]:i+1}")
    break
  fi
done

[[ ${#args[@]} -eq 2 || ${#args[@]} -eq 5 ]] || die 'expected SHA, path and zero or three images.'
sha="${args[0]}"
path="${args[1]}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'expected a full lowercase Git SHA.'
[[ "$path" == "$ROOT_DIR" ]] || die "deploy path must be $ROOT_DIR."
if [[ ${#args[@]} -eq 5 ]]; then
  components=(frontend backend postgres)
  for n in 0 1 2; do
    [[ "${args[n + 2]}" =~ ^ghcr\.io/calebhabesh/linewatch-${components[n]}@sha256:[0-9a-f]{64}$ ]] \
      || die "invalid pinned ${components[n]} image."
  done
fi

cd "$ROOT_DIR"
"$GIT_BIN" fetch --quiet --no-tags origin main
"$GIT_BIN" merge-base --is-ancestor "$sha" FETCH_HEAD || die 'release is not on main.'
release_script="$("$GIT_BIN" show FETCH_HEAD:scripts/prod-remote-release.sh)"

bash -c "$release_script" bash "${args[@]}" < /dev/null
