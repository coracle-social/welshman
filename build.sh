#!/bin/bash

for package in $(./get_packages.py); do
  ./build_and_link.sh $package
done
