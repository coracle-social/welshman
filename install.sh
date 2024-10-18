#!/bin/bash

upstream=$1

if [[ -z $upstream ]]; then
  echo "Please provide an upstream package name"
  exit 1
fi

version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$upstream/package.json)

for downstream in $(./get_packages.py); do
  n=@welshman/$upstream
  f=packages/$downstream/package.json
  v=$(jq '.dependencies["'$n'"] // empty' $f)

  if [[ ! -z $v ]]; then
    jq '.dependencies["'$n'"]="'~$version'"' $f > $f.tmp
    mv $f.tmp $f
    mkdir -p packages/$downstream/node_modules/@welshman
  fi
done

npm i
