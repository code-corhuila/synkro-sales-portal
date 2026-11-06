// Browser-only: creates a temporary object URL, clicks a detached anchor to
// start the browser's save dialog, and revokes the URL right after. No part
// of this touches storage or a second HTTP client.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
