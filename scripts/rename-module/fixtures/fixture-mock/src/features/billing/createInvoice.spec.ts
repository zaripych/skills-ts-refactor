import { createInvoice } from './createInvoice'

jest.mock('./createInvoice')

export const sibling = createInvoice()
