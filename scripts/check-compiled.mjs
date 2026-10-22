import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findViolations, readCompiled } from './compiledCheck.mjs'

// Run after the build (CI and the image build do): fails when the compiled portal
// has a gateway address, token handling or a direct HTTP client.
const directory = process.argv[2] ?? 'dist'

const entryPath = join(directory, 'assets', 'remoteEntry.js')
if (!existsSync(entryPath)) {
  console.error('check-compiled: assets/remoteEntry.js is missing.')
  process.exit(1)
}
const entry = readFileSync(entryPath, 'utf8')
if (!entry.includes('"./App"') || entry.includes('__federation_placeholder')) {
  console.error('check-compiled: App export or federation CSS placeholders are invalid.')
  process.exit(1)
}

if (!existsSync(directory)) {
  console.error(`check-compiled: ${directory} does not exist. Build the portal first.`)
  process.exit(1)
}

const violations = findViolations(readCompiled(directory))

if (violations.length > 0) {
  for (const { file, rule } of violations) console.error(`check-compiled: ${rule} in ${file}`)
  process.exit(1)
}

console.log(`check-compiled: ${directory} has no gateway address and no token handling.`)
