#!/bin/bash

for package in $(ls packages); do
  if [ $(./show_changes.sh $package | wc -l) -gt 0 ]; then
    echo $package
  fi
done
