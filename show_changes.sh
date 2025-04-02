#!/bin/bash

package=$1
tag=$(git describe --tags --abbrev=0 --match=$package'/*')

git diff "$tag" "packages/$package"
