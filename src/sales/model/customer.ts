// Field names are the CustomerResponse OpenAPI contract (synkro-customers-api).
export interface Customer {
  customerId: string
  name: string
  identityDocument: string
  email?: string | null
  phone?: string | null
  address?: string | null
  registrationDate: string
  active: boolean
}

// What a sale keeps of a customer while it is being built: the person and how to recognise them.
// Contacts are never part of a selection, and the sale itself stores only the customerId.
export interface CustomerChoice {
  customerId: string
  name: string
  identityDocument: string
}

// POST /api/v1/customers/search (HU-CLI-05). The answer carries only what a selector needs.
export type CustomerMatch = 'DOCUMENT_EXACT' | 'DOCUMENT_PREFIX' | 'NAME'
export interface CustomerSuggestion extends CustomerChoice {
  active: boolean
  match: CustomerMatch
}
export interface CustomerSearchResult {
  data: CustomerSuggestion[]
  // More than the bounded number matched: the person should refine the text (there is no paging).
  hasMore: boolean
}

export const CUSTOMER_QUERY_MIN = 2
export const CUSTOMER_QUERY_MAX = 100
export const CUSTOMER_SUGGESTION_LIMIT = 5

// Length is counted in code points after trimming, like the service does.
export const customerQueryLength = (text: string) => Array.from(text.trim()).length
