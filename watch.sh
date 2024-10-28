#!/bin/bash

for package in $(./get_packages.py); do
  npx onchange packages/$package -e '**/build/**' -k -- ./build_and_link.sh $package &
done

wait
