import { Pact, Matchers } from '@pact-foundation/pact'
import { resolve } from 'node:path'
import { apiClient } from '../../src/test-doubles/shellApiClient'
import { getSale } from '../../src/sales/api/salesApi'
const ID='550e8400-e29b-41d4-a716-446655440099'
const sale = {saleId:Matchers.uuid(ID),customerId:Matchers.uuid('550e8400-e29b-41d4-a716-446655440001'),
  createdBy:Matchers.uuid('550e8400-e29b-41d4-a716-446655440002'),date:Matchers.regex('^\\d{4}-\\d{2}-\\d{2}T.*Z$','2026-11-10T00:00:00Z'),
  totalCents:100,active:true,details:[{detailId:Matchers.uuid('550e8400-e29b-41d4-a716-446655440003'),
    productId:Matchers.uuid('550e8400-e29b-41d4-a716-446655440004'),quantity:1,unitPriceCents:100,subtotalCents:100,active:true}]}
for (const numbered of [true,false]) it(`actual Sales client reads ${numbered?'numbered':'legacy unnumbered'} sale`,async()=>{
  const pact=new Pact({consumer:'SalesPortal',provider:'SalesAPI',dir:resolve('tests/pact/pacts'),logLevel:'error'})
  const response=numbered?{...sale,commercialNumber:Matchers.regex('^VEN-[1-9][0-9]{3}-[0-9]{6}$','VEN-2026-000001')}:sale
  await pact.addInteraction().given(numbered?'a numbered pact sale exists':'a legacy unnumbered pact sale exists')
    .uponReceiving(numbered?'read numbered receipt data':'read legacy receipt data without backfill')
    .withRequest('GET',Matchers.fromProviderState('/api/v1/sales/${saleId}',`/api/v1/sales/${ID}`))
    .willRespondWith(200,b=>b.headers({'Content-Type':'application/json'}).jsonBody(response))
    .executeTest(async mock=>{
      apiClient.request.mockImplementation(async path=>{const r=await fetch(mock.url+path);return r.json()})
      const actual=await getSale(ID)
      expect(actual.totalCents).toBe(100)
      if(numbered)expect(actual.commercialNumber).toMatch(/^VEN-/)
      else expect(actual).not.toHaveProperty('commercialNumber')
    })
})
