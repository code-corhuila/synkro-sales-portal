import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, failure, ids, pageOf, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { loadSaleDocumentSources } from './saleDocumentApi'

function serveSale(read: () => Promise<unknown>) {
  apiClient.request.mockReset().mockImplementation(async path => {
    if (path.startsWith('/api/v1/sales/')) return read()
    if (path.startsWith('/api/v1/customers/')) return customerFixture()
    if (path === '/api/v1/products/categories') return pageOf([])
    return productFixture()
  })
}
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>vi.useRealTimers())

it('retries a document GET429 only after the Host retryAt instant, preserving the request', async()=>{
  let calls=0
  serveSale(async()=>{
    if (++calls===1) throw {...failure(429),retryAt:Date.now()+1500}
    return saleFixture()
  })
  const observed=loadSaleDocumentSources(ids.sale).then(value=>({value,error:null}),error=>({value:null,error}))
  await vi.advanceTimersByTimeAsync(1499)
  expect(calls).toBe(1)
  await vi.advanceTimersByTimeAsync(1)
  const result=await observed
  expect(result.error).toBeNull()
  expect(result.value?.sale.saleId).toBe(ids.sale)
  expect(calls).toBe(2)
  expect(apiClient.request.mock.calls.filter(([path])=>path.startsWith('/api/v1/sales/')).map(([path,options])=>[path,options?.method])).toEqual([
    [`/api/v1/sales/${ids.sale}`,undefined],[`/api/v1/sales/${ids.sale}`,undefined],
  ])
})

it('stops after three429 attempts and never produces source data', async()=>{
  let calls=0
  serveSale(async()=>{calls++;throw failure(429)})
  const observed=loadSaleDocumentSources(ids.sale).catch(error=>error)
  await vi.advanceTimersByTimeAsync(10000)
  expect((await observed).code).toBe('TRANSPORT')
  expect(calls).toBe(3)
})

it.each([401,403,404,500,0])('never automatically retries status%i',async status=>{
  let calls=0
  serveSale(async()=>{calls++;throw failure(status)})
  const observed=loadSaleDocumentSources(ids.sale).catch(error=>error)
  await vi.advanceTimersByTimeAsync(10000)
  expect(await observed).toBeDefined()
  expect(calls).toBe(1)
})

it('cancels a pending429 wait without sending another request',async()=>{
  let calls=0
  serveSale(async()=>{calls++;throw {...failure(429),retryAt:Date.now()+1500}})
  const controller=new AbortController()
  const observed=loadSaleDocumentSources(ids.sale,{signal:controller.signal}).catch(error=>error)
  await vi.advanceTimersByTimeAsync(100)
  controller.abort()
  await vi.advanceTimersByTimeAsync(5000)
  expect((await observed).name).toBe('AbortError')
  expect(calls).toBe(1)
})

it('does not retry early when Retry-After exceeds the bounded wait budget',async()=>{
  let calls=0
  serveSale(async()=>{calls++;throw {...failure(429),retryAt:Date.now()+60000}})
  const observed=loadSaleDocumentSources(ids.sale).catch(error=>error)
  await vi.advanceTimersByTimeAsync(10000)
  expect((await observed).code).toBe('TRANSPORT')
  expect(calls).toBe(1)
})
