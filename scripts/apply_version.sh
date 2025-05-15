#!/bin/bash
set -e

# Run the TypeScript script using ts-node
pnpm exec ts-node scripts/apply_version.ts
