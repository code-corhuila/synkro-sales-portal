// @ts-expect-error Build-time JavaScript module, exercised directly by this regression.
import { findViolations } from '../scripts/compiledCheck.mjs'

const binding = 'const STORAGE_KEY = "synkro.sales.intent.v1";'
it('permite solo los accesos explícitos al registro de recuperación sin habilitar credenciales', () => {
  expect(findViolations([{ name: 'app.js', text: `${binding} sessionStorage.setItem(STORAGE_KEY, record); sessionStorage.getItem(STORAGE_KEY); sessionStorage.removeItem(STORAGE_KEY);` }])).toEqual([])
  for (const access of ['sessionStorage.getItem("token")', 'sessionStorage.clear()', 'const other = sessionStorage', 'localStorage.getItem(STORAGE_KEY)', 'sessionStorage["getItem"](STORAGE_KEY)']) {
    expect(findViolations([{ name: 'app.js', text: `${binding} ${access}` }])).toContainEqual({ file: 'app.js', rule: 'token-handling' })
  }
  expect(findViolations([{ name: 'app.js', text: 'const STORAGE_KEY = "other"; sessionStorage.getItem(STORAGE_KEY)' }])).not.toEqual([])
})
