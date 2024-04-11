#!/bin/bash

npm i

for upstream in $(ls packages); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$upstream/package.json)

  for downstream in $(ls packages); do
    n=@coracle.social/$upstream
    f=packages/$downstream/package.json
    v=$(jq '.dependencies["'$n'"] // empty' $f)

    if [[ ! -z $v ]]; then
      jq '.dependencies["'$n'"]="'$version'"' $f > $f.tmp
      mv $f.tmp $f
      mkdir -p packages/$downstream/node_modules/@coracle.social
    fi
  done
done
