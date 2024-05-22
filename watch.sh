#!/bin/bash

./build.sh

for package in $(ls packages); do
  npx onchange packages/$package -e '**/build/**' -k -- ./build_and_link.sh $package &
done

wait
