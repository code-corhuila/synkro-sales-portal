import { Pact, Matchers } from '@pact-foundation/pact'
import { resolve } from 'node:path'
import { apiClient } from '../../src/test-doubles/shellApiClient'
import { searchCustomers } from '../../src/sales/api/customersApi'

const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`
const item = (n: number, name: string, document: string) => ({ customerId: Matchers.uuid(id(n)), name,
  identityDocument: document, active: true, match: 'DOCUMENT_EXACT' })
const cases = [
  { state: 'two folded exact identities exist', query: 'abc123', count: 2, more: false,
    data: [item(1, 'Synthetic Alpha', 'ABC123'), item(2, 'Synthetic Beta', 'abc123')] },
  { state: 'six folded exact identities exist', query: 'def789', count: 5, more: true,
    data: ['DEF','DEf','DeF','Def','dEF'].map((p,i) => item(i+10, `Candidate ${i}`, p+'789')) },
  { state: 'one exact identity exists', query: 'one456', count: 1, more: false,
    data: [item(20, 'Unique Synthetic', 'ONE456')] },
  { state: 'no customer matches the query', query: 'zzpactnone', count: 0, more: false, data: [] },
]
for (const scenario of cases) it(`actual Sales client consumes ${scenario.state}`, async () => {
  const pact = new Pact({ consumer: 'SalesPortal', provider: 'CustomersAPI', dir: resolve('tests/pact/pacts'), logLevel: 'error' })
  await pact.addInteraction().given(scenario.state).uponReceiving(scenario.state)
    .withRequest('POST', '/api/v1/customers/search', b => b.jsonBody({ query: scenario.query, status: 'ACTIVE' }))
    .willRespondWith(200, b => b.headers({ 'Content-Type': 'application/json' }).jsonBody({
      data: scenario.data, meta: { limit: 5, hasMore: scenario.more },
    })).executeTest(async mock => {
      apiClient.request.mockImplementation(async (path, options) => {
        const response = await fetch(mock.url + path, { method: options?.method, signal: options?.signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options?.body) })
        if (!response.ok) throw Error(`HTTP ${response.status}`)
        return response.json()
      })
      const result = await searchCustomers(scenario.query)
      expect(result.data).toHaveLength(scenario.count)
      expect(result.hasMore).toBe(scenario.more)
      expect(result.data.map(x => x.identityDocument)).toEqual(scenario.data.map(x => x.identityDocument))
      expect(apiClient.request).toHaveBeenLastCalledWith('/api/v1/customers/search', expect.objectContaining({
        method: 'POST', body: { query: scenario.query, status: 'ACTIVE' },
      }))
    })
})
