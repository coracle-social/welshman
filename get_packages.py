#!/usr/bin/env python3

import os
import json

def get_deps(package):
    with open(os.path.join('packages', package, 'package.json'), 'r') as f:
        package_data = json.load(f)

    dependencies = set()
    for dep_type in ['dependencies', 'devDependencies', 'peerDependencies']:
        if dep_type in package_data:
            dependencies.update(package_data[dep_type].keys())

    return [
        dep.replace('@welshman/', '')
        for dep in dependencies
        if dep.startswith('@welshman/')
    ]

def main():
    sorted_packages = []
    remaining_packages = {}
    for package in os.listdir('packages'):
        deps = get_deps(package)

        if not deps:
            sorted_packages.append(package)
        else:
            remaining_packages[package] = deps

    while remaining_packages:
        for package, deps in remaining_packages.items():
            if all([dep in sorted_packages for dep in deps]):
                sorted_packages.append(package)

        for package in sorted_packages:
            if package in remaining_packages:
                del remaining_packages[package]

    for package in sorted_packages:
        print(package)

if __name__ == "__main__":
    main()
