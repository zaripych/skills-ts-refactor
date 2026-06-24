import { describe, expect, it } from 'vitest'
import { setupRefactoring } from '../testing/setupRefactoring.ts'
import { renameModule } from './refactor.ts'

const setup = ({ fixturePath }: { fixturePath: string }) =>
  setupRefactoring({
    importMetaDirname: import.meta.dirname,
    fixturePath,
    refactor: renameModule,
  })

describe('renameModule', () => {
  it('renames a directory and rewrites alias and relative importers', async () => {
    await using harness = await setup({
      fixturePath: 'fixtures/fixture-rename',
    })
    const { run, readFile, readStructure } = harness

    await run({ args: ['src/features/billing', 'invoices'], diff: false })

    expect(await readStructure()).toEqual([
      'src/app.ts',
      'src/features/invoices/format.ts',
      'src/features/invoices/index.ts',
      'src/models/user.ts',
      'src/utils/logger.ts',
      'tsconfig.json',
    ])

    expect(await readFile({ relativePath: 'src/app.ts' })).toContain(
      "from '@/features/invoices'"
    )
    expect(
      await readFile({ relativePath: 'src/features/invoices/index.ts' })
    ).toContain("from './format'")
    expect(
      await readFile({ relativePath: 'src/features/invoices/index.ts' })
    ).toContain("from '../../utils/logger'")
  })

  it('renames a directory referenced from inside via crossing relative import', async () => {
    await using harness = await setup({
      fixturePath: 'fixtures/fixture-rename',
    })
    const { run, readFile, readStructure } = harness

    await run({ args: ['src/utils', 'helpers'], diff: false })

    expect(await readFile({ relativePath: 'src/app.ts' })).toContain(
      "from '@/helpers/logger'"
    )
    expect(
      await readFile({ relativePath: 'src/features/billing/index.ts' })
    ).toContain("from '../../helpers/logger'")
    expect(await readStructure()).toContain('src/helpers/logger.ts')
  })

  it('rewrites touched relative imports to absolute with --absolute-imports', async () => {
    await using harness = await setup({
      fixturePath: 'fixtures/fixture-rename',
    })
    const { run, readFile } = harness

    await run({
      args: ['src/utils', 'helpers', '--absolute-imports', '@/'],
      diff: false,
    })

    expect(
      await readFile({ relativePath: 'src/features/billing/index.ts' })
    ).toContain("from '@/helpers/logger'")
    expect(
      await readFile({ relativePath: 'src/features/billing/index.ts' })
    ).toContain("from './format'")
    expect(await readFile({ relativePath: 'src/app.ts' })).toContain(
      "from '@/helpers/logger'"
    )
  })

  it('renames a single file module', async () => {
    await using harness = await setup({
      fixturePath: 'fixtures/fixture-rename',
    })
    const { run, readFile, readStructure } = harness

    await run({ args: ['src/models/user.ts', 'account'], diff: false })

    expect(await readStructure()).toContain('src/models/account.ts')
    expect(await readFile({ relativePath: 'src/app.ts' })).toContain(
      "from '@/models/account'"
    )
    expect(
      await readFile({ relativePath: 'src/features/billing/index.ts' })
    ).toContain("from '@/models/account'")
  })

  it('rewrites alias and relative jest/vi/vitest mock paths', async () => {
    await using harness = await setup({ fixturePath: 'fixtures/fixture-mock' })
    const { run, readFile } = harness

    await run({ args: ['src/features/billing', 'invoices'], diff: false })

    const fromApp = await readFile({ relativePath: 'src/app.spec.ts' })
    expect(fromApp).toContain('jest.mock(')
    expect(fromApp).toContain("'@/features/invoices/createInvoice'")
    const fromTests = await readFile({
      relativePath: 'src/tests/billing.spec.ts',
    })
    expect(fromTests).toContain("vi.mock('../features/invoices/createInvoice')")
    expect(fromTests).toContain(
      "vitest.mock('../features/invoices/createInvoice')"
    )
  })

  it('leaves a within-directory relative mock path unchanged when renaming its directory', async () => {
    await using harness = await setup({ fixturePath: 'fixtures/fixture-mock' })
    const { run, readFile } = harness

    await run({ args: ['src/features/billing', 'invoices'], diff: false })

    expect(
      await readFile({
        relativePath: 'src/features/invoices/createInvoice.spec.ts',
      })
    ).toContain("jest.mock('./createInvoice')")
  })

  it('rewrites a relative mock path to alias with --absolute-imports', async () => {
    await using harness = await setup({ fixturePath: 'fixtures/fixture-mock' })
    const { run, readFile } = harness

    await run({
      args: ['src/features/billing', 'invoices', '--absolute-imports', '@/'],
      diff: false,
    })

    expect(
      await readFile({ relativePath: 'src/tests/billing.spec.ts' })
    ).toContain("vi.mock('@/features/invoices/createInvoice')")
  })

  it('refuses to rename a file referenced through an exact path alias', async () => {
    await using harness = await setup({
      fixturePath: 'fixtures/fixture-exact-alias',
    })
    const { run, readFile, readStructure } = harness
    const before = await readFile({ relativePath: 'src/app.ts' })
    const structureBefore = await readStructure()

    await expect(
      run({ args: ['src/utils/logger.ts', 'log'], diff: false })
    ).rejects.toThrow(/exact tsconfig path aliases/)

    expect(await readFile({ relativePath: 'src/app.ts' })).toEqual(before)
    expect(await readStructure()).toEqual(structureBefore)
  })

  it('changes nothing on disk in dry-run mode', async () => {
    await using harness = await setup({
      fixturePath: 'fixtures/fixture-rename',
    })
    const { run, readFile, readStructure } = harness
    const before = await readFile({ relativePath: 'src/app.ts' })
    const structureBefore = await readStructure()

    await run({ args: ['src/features/billing', 'invoices'], diff: true })

    expect(await readFile({ relativePath: 'src/app.ts' })).toEqual(before)
    expect(await readStructure()).toEqual(structureBefore)
  })
})
