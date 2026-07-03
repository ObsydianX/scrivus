// Parses an HTML fragment without touching the live document. Unlike assigning
// to innerHTML on a created element, DOMParser never loads resources or fires
// inline event handlers, so untrusted content (imports, shared projects) is inert.
export function parseHtmlFragment(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body
}

export function htmlFragmentText(html: string): string {
  return parseHtmlFragment(html).textContent ?? ''
}
