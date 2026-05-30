let nextId = 10

export function getNextIdValue(): number {
  return nextId
}

export function setNextIdValue(value: number) {
  nextId = value
}

export function allocateNextId(): number {
  return nextId++
}
