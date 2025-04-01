#!/bin/bash

for package in $(./get_packages.py); do
  ./build_and_link.sh $package

  if [[ $? -eq 1 ]]; then
    exit 1
  fi
done
