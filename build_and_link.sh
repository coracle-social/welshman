#!/bin/bash

upstream=$1

npm run build -w @welshman/$upstream
npm run lint -w @welshman/$upstream

for downstream in $(ls packages); do
  n=@welshman/$upstream
  f=packages/$downstream/package.json
  v=$(jq '.dependencies["'$n'"] // empty' $f)

  if [[ ! -z $v ]]; then
    mkdir -p packages/$downstream/node_modules/@welshman
    cp -r packages/$upstream/build packages/$downstream/node_modules/@welshman/build
    cp -r packages/$upstream/build node_modules/@welshman/build
  fi
done
