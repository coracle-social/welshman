#!/bin/bash

for package in $(ls packages); do
  ./build_and_link.sh $package
  npx onchange packages/$package -e '**/build/**' -k -- ./build_and_link.sh $package &
done

wait
