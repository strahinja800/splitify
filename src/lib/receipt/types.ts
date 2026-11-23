export type SufSpecificationItem = {
  gtin: string
  name: string
  quantity: number
  unitPrice: number // RSD
  total: number // RSD
  label: string // tax symbol ex. 'E'
  labelRate: number // tax percentage ex. 20
  taxBaseAmount: number // RSD
  vatAmount: number // RSD
}

export type SufSpecificationsResponse = {
  success: boolean
  items: SufSpecificationItem[]
}

// Data from HTML receipt page
export type SufPageData = {
  invoiceNumber: string
  token: string
  storeName: string | null
  total: number // RSD, already parsed from format ex. '12.345,00'
}

export type ParsedReceiptItem = {
  name: string
  guantity: number // just for show, can be float
  unitPrice: number // money (Int)
  total: number // money (Int)
}

export type ParsedReceipt = {
  receiptNumber: string
  storeName: string | null
  total: number // money (Int). Equal items[].total
  items: ParsedReceiptItem[]
}

// ERRORS

export const RECEIPT_ERROR_CODES = [
  'INVALID_URL',
  'NOT_FOUND',
  'SUF_UNAVAILABLE',
  'PARSE_FAILED',
  'TOTAL_MISMATCH',
] as const

export type ReceiptErrorCode = (typeof RECEIPT_ERROR_CODES)[number]
