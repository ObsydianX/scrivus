import { parseHtmlFragment } from './html'

export type ProjectVariableValue = number | string
export type ProjectVariables = Record<string, ProjectVariableValue>

const EXPRESSION_PATTERN = /\{\{([\s\S]*?)\}\}/g
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const QUALIFIED_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_]*$/

class ExpressionParser {
  private index = 0

  constructor(private readonly source: string, private readonly resolveVariable: (name: string) => number) {}

  parse(): number {
    const value = this.parseAdditive()
    this.skipWhitespace()
    if (this.index !== this.source.length || !Number.isFinite(value)) throw new Error('Invalid expression')
    return value
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative()
    while (true) {
      this.skipWhitespace()
      if (this.consume('+')) value += this.parseMultiplicative()
      else if (this.consume('-')) value -= this.parseMultiplicative()
      else return value
    }
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary()
    while (true) {
      this.skipWhitespace()
      if (this.consume('*')) value *= this.parseUnary()
      else if (this.consume('/')) {
        const divisor = this.parseUnary()
        if (divisor === 0) throw new Error('Division by zero')
        value /= divisor
      } else return value
    }
  }

  private parseUnary(): number {
    this.skipWhitespace()
    if (this.consume('+')) return this.parseUnary()
    if (this.consume('-')) return -this.parseUnary()
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    this.skipWhitespace()
    if (this.consume('(')) {
      const value = this.parseAdditive()
      this.skipWhitespace()
      if (!this.consume(')')) throw new Error('Missing closing parenthesis')
      return value
    }

    const numberMatch = this.source.slice(this.index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
    if (numberMatch) {
      this.index += numberMatch[0].length
      return Number(numberMatch[0])
    }

    const nameMatch = this.source.slice(this.index).match(/^[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?/)
    if (nameMatch) {
      this.index += nameMatch[0].length
      return this.resolveVariable(nameMatch[0])
    }

    throw new Error('Expected a number, variable, or parenthesis')
  }

  private skipWhitespace() {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1
  }

  private consume(character: string) {
    if (this.source[this.index] !== character) return false
    this.index += 1
    return true
  }
}

export function isValidProjectVariableName(name: string) {
  return IDENTIFIER_PATTERN.test(name)
}

export function isValidProjectVariableReference(name: string) {
  return QUALIFIED_IDENTIFIER_PATTERN.test(name)
}

export function evaluateProjectExpression(expression: string, variables: ProjectVariables): number | null {
  try {
    const variableKeys = new Map<string, string>()
    Object.keys(variables).forEach(key => {
      const normalized = key.toLowerCase()
      if (!variableKeys.has(normalized)) variableKeys.set(normalized, key)
    })
    const resolving = new Set<string>()
    const resolved = new Map<string, number>()
    const resolveVariable = (name: string): number => {
      const normalizedName = name.toLowerCase()
      const storedName = variableKeys.get(normalizedName)
      if (!storedName) throw new Error('Unknown variable')
      if (resolved.has(normalizedName)) return resolved.get(normalizedName) as number
      if (resolving.has(normalizedName)) throw new Error('Circular variable reference')
      resolving.add(normalizedName)
      const definition = variables[storedName]
      const value = typeof definition === 'number'
        ? definition
        : new ExpressionParser(definition, resolveVariable).parse()
      resolving.delete(normalizedName)
      if (!Number.isFinite(value)) throw new Error('Invalid variable value')
      resolved.set(normalizedName, value)
      return value
    }
    return new ExpressionParser(expression, resolveVariable).parse()
  } catch {
    return null
  }
}

function formatExpressionResult(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)))
}

export function renderProjectExpressions(text: string, variables: ProjectVariables) {
  return text.replace(EXPRESSION_PATTERN, (source, expression: string) => {
    const value = evaluateProjectExpression(expression, variables)
    return value === null ? source : formatExpressionResult(value)
  })
}

export function hasInvalidProjectExpressions(text: string, variables: ProjectVariables) {
  for (const match of text.matchAll(EXPRESSION_PATTERN)) {
    if (evaluateProjectExpression(match[1], variables) === null) return true
  }
  return false
}

export function renderProjectExpressionsInHtml(html: string, variables: ProjectVariables) {
  if (!html.includes('{{')) return html
  const root = parseHtmlFragment(html)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    node.nodeValue = renderProjectExpressions(node.nodeValue ?? '', variables)
    node = walker.nextNode()
  }
  return root.innerHTML
}
