#!/bin/bash

for package in $(ls packages); do
  npx onchange packages/$package -e '**/dist/**' -e '**/*.tsbuildinfo' -k -- pnpm run --filter $package build &
done

echo "Watching for changes"

wait
