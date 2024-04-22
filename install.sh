#!/bin/bash

for upstream in $(ls packages); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$upstream/package.json)

  for downstream in $(ls packages); do
    n=@welshman/$upstream
    f=packages/$downstream/package.json
    v=$(jq '.dependencies["'$n'"] // empty' $f)

    if [[ ! -z $v ]]; then
      jq '.dependencies["'$n'"]="'$version'"' $f > $f.tmp
      mv $f.tmp $f
      mkdir -p packages/$downstream/node_modules/@welshman
    fi
  done
done

npm i
