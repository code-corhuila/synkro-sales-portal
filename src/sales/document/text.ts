export const REPLACEMENT = '�'

// XML 1.0 "Char": #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]. The C1 controls
// (U+007F-U+009F) are legal but "discouraged" by the spec and rendered inconsistently, so they go too.
// Anything else (C0 controls, U+FFFE/U+FFFF, lone surrogates) is replaced by U+FFFD, never silently dropped.
function isCarried(codePoint: number): boolean {
  if (codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD) return true
  if (codePoint < 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F)) return false
  if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return false
  return codePoint !== 0xFFFE && codePoint !== 0xFFFF
}

// One text policy for every value that reaches a file: PDF and XML print exactly the same string.
// NFC, characters XML 1.0 cannot carry replaced, whitespace runs (including line breaks) collapsed, trimmed.
export function sanitizeText(value: string): string {
  let out = ''
  for (const char of value.normalize('NFC')) out += isCarried(char.codePointAt(0)!) ? char : REPLACEMENT
  return out.replace(/[ \t\r\n]+/g, ' ').trim()
}

// Optional contact data: absent, null or blank means "not printed" — never an empty label or the word undefined.
export function optionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = sanitizeText(value)
  return clean ? clean : undefined
}
