#!/usr/bin/env python3

import os
import json
from collections import defaultdict

def parse_package_json(file_path):
    with open(file_path, 'r') as f:
        return json.load(f)

def get_dependencies(package_data):
    dependencies = set()
    for dep_type in ['dependencies', 'devDependencies', 'peerDependencies']:
        if dep_type in package_data:
            dependencies.update(package_data[dep_type].keys())
    return dependencies

def topological_sort(graph):
    visited = set()
    stack = []

    def dfs(node):
        visited.add(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                dfs(neighbor)
        stack.append(node)

    for node in graph:
        if node not in visited:
            dfs(node)

    return stack[::-1]

def main():
    packages_dir = 'packages'
    package_graph = defaultdict(set)
    all_packages = set()

    # Walk through the packages directory
    for package_name in os.listdir(packages_dir):
        package_path = os.path.join(packages_dir, package_name)
        if os.path.isdir(package_path):
            package_json_path = os.path.join(package_path, 'package.json')
            if os.path.exists(package_json_path):
                all_packages.add(package_name)
                package_data = parse_package_json(package_json_path)
                dependencies = get_dependencies(package_data)

                # Only consider dependencies that are in the packages directory
                internal_dependencies = dependencies.intersection(all_packages)
                package_graph[package_name].update(internal_dependencies)

    # Perform topological sort
    sorted_packages = topological_sort(package_graph)

    # Output the result
    for package in sorted_packages:
        print(package)

if __name__ == "__main__":
    main()
