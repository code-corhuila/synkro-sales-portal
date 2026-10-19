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
