#!/usr/bin/env bash
# Copy the rename-module fixture into a temp directory and run the refactor in
# dry-run mode so you can inspect the diff. Nothing is written to the fixture.
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TSX="$SCRIPTS_DIR/node_modules/.bin/tsx"
FIXTURE="$SCRIPTS_DIR/rename-module/fixtures/fixture-rename"

# Usage: demo-dry-run.sh <source> <newName> [extra flags...]
#   ./demo-dry-run.sh src/features/billing invoices
#   ./demo-dry-run.sh src/utils helpers --absolute-imports @/
SOURCE="${1:?usage: demo-dry-run.sh <source> <newName> [extra flags...]}"
NEW_NAME="${2:?usage: demo-dry-run.sh <source> <newName> [extra flags...]}"
shift 2

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ts-refactor-demo-XXXXXX")"
trap 'rm -rf "$PROJECT_DIR"' EXIT

cp -R "$FIXTURE/." "$PROJECT_DIR/"

echo "Fixture copied to: $PROJECT_DIR"
echo "Running: rename-module $SOURCE $NEW_NAME $* --diff"
echo

"$TSX" "$SCRIPTS_DIR/rename-module" \
  --project-root "$PROJECT_DIR" \
  --diff \
  "$SOURCE" "$NEW_NAME" "$@"
