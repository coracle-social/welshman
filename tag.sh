#!/bin/bash

status=$(git status | grep "nothing to commit")

if [[ -z "$status" ]]; then
  echo "Can't tag with uncommitted changes"
  exit 1
fi

for pkg in $(ls packages); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$pkg/package.json)

  git tag "$pkg/$version" >/dev/null 2>&1
done

git push
git push --tags
