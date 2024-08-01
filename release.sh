#!/bin/bash

for package in $(./get_packages.py); do
  npm run pub -w "packages/$package"
done
