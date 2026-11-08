import { loadSaleDocumentSources } from '../api/saleDocumentApi'
import { buildSaleDocument } from './buildSaleDocument'
import { readIssuerConfig } from './issuerConfig'
import type { SaleDocument } from './types'

interface Options {
  signal?: AbortSignal
  now?: Date
  env?: Record<string, string | undefined>
}

// Everything that happens before a file exists: issuer configuration (checked first, so a missing NIT costs
// no request), the authorized reads, and the single model PDF and XML are both rendered from.
export async function prepareSaleDocument(saleId: string, { signal, now = new Date(), env }: Options = {}): Promise<SaleDocument> {
  const issuer = readIssuerConfig(env)
  const sources = await loadSaleDocumentSources(saleId, { signal })
  return buildSaleDocument({ ...sources, issuer, now })
}
