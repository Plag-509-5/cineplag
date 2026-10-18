#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "ERROR: Set MONGODB_URI in the server environment before starting CinéPlag." >&2
  exit 1
fi

if [[ "${AUTO_UPDATE:-0}" == "1" ]]; then
  if [[ ! -d .git ]]; then
    echo "ERROR: AUTO_UPDATE=1, but this deployment has no .git directory. Deploy a Git checkout or set AUTO_UPDATE=0." >&2
    exit 1
  fi
  echo "Pulling the latest commit for the currently checked-out branch..."
  git pull --ff-only
fi

if [[ -n "${NODE_PACKAGES:-}" ]]; then
  # Pterodactyl provides NODE_PACKAGES as a space-separated package list.
  npm install ${NODE_PACKAGES}
fi

if [[ -n "${UNNODE_PACKAGES:-}" ]]; then
  # Pterodactyl provides UNNODE_PACKAGES as a space-separated package list.
  npm uninstall ${UNNODE_PACKAGES}
fi

if [[ ! -f package.json ]]; then
  echo "ERROR: package.json was not found in $(pwd)." >&2
  exit 1
fi

npm install
npm run build
exec npm run start
