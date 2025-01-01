#!/bin/bash

for package in $(./get_packages.py); do
  npx onchange packages/$package -e '**/build/**' -e '**/dist/**' -e '**/.svelte-kit/**' -k -- ./build_and_link.sh $package &
done

wait
