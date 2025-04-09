#!/bin/bash

for package in $(ls packages|sort); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$package/package.json)

  echo '"@welshman/'$package'": "^'$version'",'
done
