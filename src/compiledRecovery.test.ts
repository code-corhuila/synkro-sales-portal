// @ts-expect-error Build-time JavaScript module, exercised directly by this regression.
import { findViolations } from '../scripts/compiledCheck.mjs'

const binding = 'const STORAGE_KEY = "synkro.sales.intent.v1";'
it('permite solo los accesos explícitos al registro de recuperación sin habilitar credenciales', () => {
  expect(findViolations([{ name: 'app.js', text: `${binding} sessionStorage.setItem(STORAGE_KEY, record); sessionStorage.getItem(STORAGE_KEY); sessionStorage.removeItem(STORAGE_KEY);` }])).toEqual([])
  expect(findViolations([{ name: 'app.js', text: binding.replace('const', 'var') + 'sessionStorage.getItem(STORAGE_KEY)' }])).toEqual([])
  for (const access of ['sessionStorage.getItem("token")', 'sessionStorage.clear()', 'const other = sessionStorage', 'localStorage.getItem(STORAGE_KEY)', 'sessionStorage["getItem"](STORAGE_KEY)']) {
    expect(findViolations([{ name: 'app.js', text: `${binding} ${access}` }])).toContainEqual({ file: 'app.js', rule: 'token-handling' })
  }
  expect(findViolations([{ name: 'app.js', text: 'const STORAGE_KEY = "other"; sessionStorage.getItem(STORAGE_KEY)' }])).not.toEqual([])
})

const draftBinding = 'const DRAFT_STORAGE_KEY = "synkro.sales.draft.v1";'
it('permite el registro del borrador de la venta (solo identificadores y cantidades) con las mismas garantías', () => {
  const both = `${binding} ${draftBinding}`
  expect(findViolations([{ name: 'app.js', text: `${both} sessionStorage.setItem(STORAGE_KEY, a); sessionStorage.getItem(DRAFT_STORAGE_KEY); sessionStorage.setItem(DRAFT_STORAGE_KEY, b); sessionStorage.removeItem(DRAFT_STORAGE_KEY);` }])).toEqual([])
  for (const access of ['sessionStorage.getItem("token")', 'sessionStorage.clear()', 'const other = sessionStorage', 'localStorage.getItem(DRAFT_STORAGE_KEY)', 'sessionStorage["getItem"](DRAFT_STORAGE_KEY)', 'sessionStorage.getItem(DRAFT_STORAGE_KEY_2)']) {
    expect(findViolations([{ name: 'app.js', text: `${both} ${access}` }])).toContainEqual({ file: 'app.js', rule: 'token-handling' })
  }
  // The exception belongs to its own binding and its own literal.
  expect(findViolations([{ name: 'app.js', text: 'const DRAFT_STORAGE_KEY = "other"; sessionStorage.getItem(DRAFT_STORAGE_KEY)' }])).not.toEqual([])
  expect(findViolations([{ name: 'app.js', text: `${binding} sessionStorage.getItem(DRAFT_STORAGE_KEY)` }])).not.toEqual([])
  expect(findViolations([{ name: 'app.js', text: `${draftBinding} sessionStorage.getItem(STORAGE_KEY)` }])).not.toEqual([])
})
