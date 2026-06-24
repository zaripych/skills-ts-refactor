import { createInvoice } from '@/features/billing/createInvoice'

jest.mock(
  '@/features/billing/createInvoice',
  () => ({
    createInvoice: () => 'mock',
  }),
)

export const fromApp = createInvoice()
