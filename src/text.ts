export function htmlToPlainLines(html: string): string[] {
  const div = document.createElement('div')
  div.innerHTML = html
  const lines: string[] = []

  const collectLine = (el: Element) => {
    if (el.tagName === 'HR') {
      lines.push('* * *')
      return
    }

    const text = el.textContent ?? ''
    if (!text.trim()) return

    if (el.tagName === 'LI') {
      const parent = el.parentElement
      if (parent?.tagName === 'OL') {
        const index = Array.from(parent.children).indexOf(el) + 1
        lines.push(`${index}. ${text}`)
      } else {
        lines.push(`- ${text}`)
      }
      return
    }

    lines.push(text)
  }

  div.querySelectorAll('p, li, blockquote, hr').forEach(collectLine)
  return lines.length ? lines : [div.textContent ?? '']
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
