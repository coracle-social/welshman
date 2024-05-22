#!/bin/bash

for package in $(ls packages); do
  ./build_and_link.sh $package
done
