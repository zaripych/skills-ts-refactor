import { createInvoice } from '../features/billing/createInvoice'

vi.mock('../features/billing/createInvoice')
vitest.mock('../features/billing/createInvoice')

export const fromTests = createInvoice()
