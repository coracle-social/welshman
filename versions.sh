#!/bin/bash

for upstream in $(./get_packages.py); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$upstream/package.json)

  echo $upstream $version
done
