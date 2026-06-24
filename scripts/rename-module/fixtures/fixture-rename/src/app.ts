import { invoiceFor } from '@/features/billing'
import type { User } from '@/models/user'
import { log } from '@/utils/logger'

const main = (user: User): void => {
  log(invoiceFor(user, 42))
}

export { main }
