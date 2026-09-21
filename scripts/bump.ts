import {readFileSync, writeFileSync, readdirSync} from "fs"
import {join} from "path"

const releases = ["major", "minor", "patch"] as const

type Release = (typeof releases)[number]

const release = process.argv[2] as Release

if (!releases.includes(release)) {
  console.error(`Usage: pnpm bump <${releases.join("|")}>`)
  process.exit(1)
}

// Read the root package.json to get the current version
const rootPackageJsonPath = "package.json"
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8"))
const currentVersion = rootPackageJson.version

if (!currentVersion) {
  console.error("No version found in root package.json")
  process.exit(1)
}

const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion)

if (!match) {
  console.error(`Expected a major.minor.patch version in root package.json, got ${currentVersion}`)
  process.exit(1)
}

const [major, minor, patch] = match.slice(1).map(Number)

let version = `${major}.${minor}.${patch + 1}`

if (release === "major") {
  version = `${major + 1}.0.0`
}

if (release === "minor") {
  version = `${major}.${minor + 1}.0`
}

// Update the root package.json first, so packages follow it
rootPackageJson.version = version

writeFileSync(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2) + "\n")
console.log(`Updated ${rootPackageJsonPath}`)

// Get all directories in packages/
const packagesDir = "packages"
const packages = readdirSync(packagesDir, {withFileTypes: true})
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name)

// Update each package.json
for (const pkg of packages) {
  const packageJsonPath = join(packagesDir, pkg, "package.json")

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))

    // Update the package version
    packageJson.version = version

    // Write back to file with proper formatting
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n")
    console.log(`Updated ${packageJsonPath}`)
  } catch (error) {
    console.error(`Error processing ${packageJsonPath}:`, error)
  }
}

console.log(`Version update complete: ${currentVersion} -> ${version}`)
