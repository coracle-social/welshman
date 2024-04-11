#!/bin/bash

upstream=$1

npm run build -w @coracle.social/$upstream

for downstream in $(ls packages); do
  n=@coracle.social/$upstream
  f=packages/$downstream/package.json
  v=$(jq '.dependencies["'$n'"] // empty' $f)

  if [[ ! -z $v ]]; then
    mkdir -p packages/$downstream/node_modules/@coracle.social
    cp -r packages/$upstream/build packages/$downstream/node_modules/@coracle.social/build
    cp -r packages/$upstream/build node_modules/@coracle.social/build
  fi
done
