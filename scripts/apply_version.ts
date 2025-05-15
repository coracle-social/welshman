import {readFileSync, writeFileSync, readdirSync} from "fs"
import {join} from "path"

// Read the root package.json to get the version
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"))
const version = rootPackage.version

if (!version) {
  console.error("No version found in root package.json")
  process.exit(1)
}

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

console.log("Version update complete!")
