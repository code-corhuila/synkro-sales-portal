// Field names are the DailyTotalResponse / MonthlyTotalResponse / TopProductResponse
// OpenAPI schemas (synkro-sales-api). Money is int64 cents.
export interface DailyTotal { day: string; dailyTotalCents: number; saleCount: number }
export interface MonthlyTotal { month: string; monthlyTotalCents: number; saleCount: number }
export interface TopProduct { productId: string; totalQuantity: number; totalRevenueCents: number }

export interface ReportRows {
  daily: DailyTotal
  monthly: MonthlyTotal
  'top-products': TopProduct
}
export type ReportKind = keyof ReportRows

export const REPORT_KINDS: readonly ReportKind[] = ['daily', 'monthly', 'top-products']

// What the person reads for each report.
export const REPORT_TEXT: Record<ReportKind, { title: string; table: string; nav: string; singular: string; plural: string }> = {
  daily: { title: 'Reporte diario', table: 'Totales diarios de ventas', nav: 'Diarios', singular: 'día', plural: 'días' },
  monthly: { title: 'Reporte mensual', table: 'Totales mensuales de ventas', nav: 'Mensuales', singular: 'mes', plural: 'meses' },
  'top-products': { title: 'Productos más vendidos', table: 'Productos más vendidos', nav: 'Más vendidos', singular: 'producto', plural: 'productos' },
}

// Roles the Sales API answers for these reports. INVENTORY never reaches them:
// the Host guard stops the route and the portal asks for nothing on its own.
export function canReadReports(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'SALESPERSON'
}
