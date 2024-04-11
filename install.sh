#!/bin/bash

# npm i

for package in $(ls packages); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$package/package.json)

  for downstream in $(ls packages); do
    n=@coracle.social/$package
    f=packages/$downstream/package.json
    v=$(jq '.dependencies["'$n'"] // empty' $f)

    if [[ ! -z $v ]]; then
      jq '.dependencies["'$n'"]="'$version'"' $f
    fi
  done
done
