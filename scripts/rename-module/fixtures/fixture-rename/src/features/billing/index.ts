import type { User } from '@/models/user'
import { log } from '../../utils/logger'
import { formatAmount } from './format'

export const invoiceFor = (user: User, amount: number): string => {
  log(`invoice for ${user.name}`)
  return formatAmount(amount)
}
