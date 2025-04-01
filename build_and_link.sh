#!/bin/bash

upstream=$1

npm run fix -w @welshman/$upstream
npm run build -w @welshman/$upstream

if [[ $? -eq 1 ]]; then
  exit 1
fi

for downstream in $(./get_packages.py); do
  n=@welshman/$upstream
  f=packages/$downstream/package.json
  v=$(jq '.dependencies["'$n'"] // empty' $f)

  if [[ ! -z $v ]]; then
    rm -rf packages/$downstream/node_modules/@welshman/$upstream
    cp -r packages/$upstream packages/$downstream/node_modules/@welshman/$upstream
    rm -rf node_modules/@welshman/$upstream
    cp -r packages/$upstream node_modules/@welshman/$upstream
  fi
done
