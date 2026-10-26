#!/usr/bin/env bash
# Installs the project's pinned official runtime without replacing /usr/bin/node.
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(tr -d '\r\n' < "$project_root/.node-version")"
[[ "$version" =~ ^24\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid pinned Node24 version' >&2; exit 1; }
[[ "$(uname -s)" = Linux && "$(uname -m)" = x86_64 ]] || { echo 'This installer targets Linux x64' >&2; exit 1; }
[[ "$EUID" = 0 ]] || { echo 'Run this installer as root' >&2; exit 1; }
name="node-v${version}-linux-x64"
runtime_root=/opt/teacher-dashboard/runtimes
target="$runtime_root/$name"
if [[ -e "$target" ]]; then
  [[ "$("$target/bin/node" --version)" = "v$version" ]]
  printf '%s\n' "$target"
  exit 0
fi
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
curl --http1.1 --fail --silent --show-error --location --retry 3 --retry-all-errors --max-time 120 "https://nodejs.org/dist/v${version}/SHASUMS256.txt" -o "$scratch/SHASUMS256.txt"
curl --http1.1 --fail --silent --show-error --location --retry 3 --retry-all-errors --max-time 120 "https://nodejs.org/dist/v${version}/${name}.tar.xz" -o "$scratch/${name}.tar.xz"
(cd "$scratch"; awk -v archive="${name}.tar.xz" '$2 == archive {print}' SHASUMS256.txt > selected.sha256; [[ -s selected.sha256 ]]; sha256sum --check selected.sha256)
tar -xJf "$scratch/${name}.tar.xz" -C "$scratch"
[[ "$("$scratch/$name/bin/node" --version)" = "v$version" ]]
install -d -m 755 "$runtime_root"
mv "$scratch/$name" "$target"
printf '%s\n' "$target"
