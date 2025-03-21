#!/bin/bash

upstream=$1

npm run fix -w @welshman/$upstream
npm run build -w @welshman/$upstream

for downstream in $(./get_packages.py); do
  n=@welshman/$upstream
  f=packages/$downstream/package.json
  v=$(jq '.dependencies["'$n'"] // empty' $f)

  if [[ ! -z $v ]]; then
    mkdir -p packages/$downstream/node_modules/@welshman/$upstream
    cp -r packages/$upstream/build packages/$downstream/node_modules/@welshman/$upstream > /dev/null 2>&1
    cp -r packages/$upstream/build node_modules/@welshman/$upstream > /dev/null 2>&1
  fi
done
