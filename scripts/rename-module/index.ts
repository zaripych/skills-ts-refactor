import { run } from '../bootstrap.ts'
import { renameModule } from './refactor.ts'

await run({ refactor: renameModule })
