// Fonts and logo ship inside the bundle as data URLs and are decoded in memory: generating the PDF never
// requests a remote resource (no Google Fonts, no CDN, no extra HTTP call). Fonts are the OFL-licensed
// @fontsource builds of the families of the approved layout (Latin subset: Spanish, accents, ñ, ¿ ¡, €).
import display900 from '@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff?inline'
import plex400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?inline'
import plex600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?inline'
import plex700 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff?inline'
import mono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?inline'
import mono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?inline'
import logo from './assets/synkro-logo.png?inline'

export function dataUrlBytes(url: string): Uint8Array {
  const binary = atob(url.slice(url.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export const FONT_DATA = {
  sans: plex400, sansSemibold: plex600, sansBold: plex700, mono: mono400, monoBold: mono700, display: display900,
} as const

export const LOGO_DATA = logo
// Natural size of assets/synkro-logo.png; the layout uses it to keep the proportion.
export const LOGO_SIZE = { width: 420, height: 262 } as const
