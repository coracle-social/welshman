#!/bin/bash

status=$(git status | grep "nothing to commit")

if [[ -z "$status" ]]; then
  echo "Can't tag with uncommitted changes"
  exit 1
fi

git tag $(cat package.json|jq -r .version) >/dev/null 2>&1

git push
git push --tags
