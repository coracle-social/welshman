#!/bin/bash

for upstream in $(ls packages); do
  version=$(sed -nr 's/ +"version": "(.+)",/\1/p' packages/$upstream/package.json)

  echo $upstream $version
done
