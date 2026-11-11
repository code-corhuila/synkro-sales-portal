import { unlinkSync, existsSync } from 'node:fs'
export default function () {
  for (const file of ['SalesPortal-CustomersAPI.json', 'SalesPortal-SalesAPI.json']) {
    const path = 'tests/pact/pacts/' + file
    if (existsSync(path)) unlinkSync(path)
  }
}
