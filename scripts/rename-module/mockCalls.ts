import { Node, type SourceFile, type StringLiteral, SyntaxKind } from 'ts-morph'

// Test runners reference the module to mock by a string path, not an import.
// ts-morph does not resolve these, so the rename must find and rewrite them.
const MOCK_OBJECTS = new Set(['jest', 'vi', 'vitest'])
const MOCK_METHODS = new Set([
  'mock',
  'doMock',
  'unmock',
  'dontMock',
  'setMock',
  'requireActual',
  'requireMock',
])

// The first string-literal argument of every `jest.mock` / `vi.mock` /
// `vitest.mock` style call (and its siblings) in the file.
export const findMockModuleLiterals = (
  sourceFile: SourceFile
): StringLiteral[] => {
  const literals: StringLiteral[] = []
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  )) {
    const expression = call.getExpression()
    if (!Node.isPropertyAccessExpression(expression)) continue
    const object = expression.getExpression()
    if (!Node.isIdentifier(object) || !MOCK_OBJECTS.has(object.getText()))
      continue
    if (!MOCK_METHODS.has(expression.getName())) continue
    const [firstArg] = call.getArguments()
    if (firstArg && Node.isStringLiteral(firstArg)) literals.push(firstArg)
  }
  return literals
}
