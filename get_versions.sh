#!/bin/bash

for package in $(./get_packages.py|sort); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$package/package.json)

  echo '"@welshman/'$package'": "^'$version'",'
done
