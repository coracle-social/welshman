#!/bin/bash

for package in $(./get_packages.py); do
  tag=$(git describe --tags --abbrev=0 --match=$package'/*')
  changes=$(git diff "$tag" "packages/$package" | wc -l)

  if [ $changes -gt 0 ]; then
    echo $package
  fi
done
