import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// What the compiled portal must not contain. The portal asks for relative paths
// through the host's client; only the host knows the gateway and holds the token.
//
// The patterns are anchored so React's own code does not trip them: it has
// `fetchPriority` and `prefetchDNS`, which are not calls to `fetch`, so a call is a
// `fetch(` that is not part of a longer name and not a method (`x.fetch(`).
// The host's remote entry (localhost:5173) is a build input, not the gateway.
export const RULES = [
  {
    rule: 'gateway-url',
    patterns: [/:8000\b/, /https?:\/\/[^\s"'`]+\/api\/v\d+/],
  },
  {
    rule: 'token-handling',
    patterns: [/\bAuthorization\b/, /\bBearer\b/, /\b(?:session|local)Storage\b/, /\b(?:access|refresh|id)_token\b/, /eyJ[\w-]+\.[\w-]+\.[\w-]+/],
  },
  {
    rule: 'direct-http',
    patterns: [/(?<![\w$.])fetch\s*\(/, /\bXMLHttpRequest\b/, /\baxios\b/],
  },
]

// One violation per file and rule: { file, rule }.
export function findViolations(files) {
  return files.flatMap(({ name, text }) =>
    RULES.filter(({ patterns }) => patterns.some((pattern) => pattern.test(text))).map(({ rule }) => ({ file: name, rule })),
  )
}

// The files the browser loads from a build: scripts and pages.
export function readCompiled(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return readCompiled(path)
    return /\.(?:js|html)$/.test(path) ? [{ name: path, text: readFileSync(path, 'utf8') }] : []
  })
}
