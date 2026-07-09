import JSZip from 'jszip'
import { parseHtmlFragment } from './html'

export type EpubCompileNode =
  | { type: 'heading'; label: string; role: 'act' | 'chapter'; depth: number }
  | { type: 'body'; label: string; html: string }

export type EpubCoverImage = {
  bytes: Uint8Array
  extension: string
  mediaType: string
}

export type EpubOptions = {
  title: string
  subtitle?: string
  author: string
  language?: string
  includeSceneTitles: boolean
  frontMatter: boolean
  cover?: EpubCoverImage
}

type EpubSection = {
  id: string
  filename: string
  title: string
  bodyXhtml: string
}

type TocItem = {
  label: string
  href: string
  depth: number
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Converts TipTap scene HTML into well-formed XHTML. DOMParser + XMLSerializer
// handles tag closure and entity escaping; scene breaks and page breaks get
// normalized into styled paragraphs.
function sceneHtmlToXhtml(html: string): string {
  const root = parseHtmlFragment(html)
  const serializer = new XMLSerializer()
  const parts: string[] = []

  for (const element of Array.from(root.children)) {
    if (element.tagName === 'HR' || element.hasAttribute('data-page-break') || element.classList.contains('page-break-node')) {
      parts.push('<p class="scene-break">* * *</p>')
      continue
    }
    // Drop editor-only attributes; keep the content structure.
    element.removeAttribute('class')
    element.removeAttribute('style')
    element.querySelectorAll('[class]').forEach(child => child.removeAttribute('class'))
    element.querySelectorAll('[style]').forEach(child => child.removeAttribute('style'))
    const serialized = serializer.serializeToString(element)
    // XMLSerializer stamps the XHTML namespace on every root element; the
    // chapter template already declares it once.
    parts.push(serialized.replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/, ''))
  }

  return parts.join('\n')
}

function chapterXhtml(title: string, bodyXhtml: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${bodyXhtml}
</body>
</html>
`
}

const EPUB_CSS = `h1.chapter-title {
  text-align: center;
  margin: 3em 0 2em;
  font-weight: bold;
}

h1.act-title {
  text-align: center;
  margin: 40% 0 0;
  font-weight: bold;
}

h2.scene-title {
  text-align: center;
  margin: 2em 0 1em;
  font-weight: bold;
}

p {
  margin: 0;
  text-indent: 1.25em;
}

h1 + p,
h2 + p,
p.scene-break + p {
  text-indent: 0;
}

p.scene-break {
  text-align: center;
  text-indent: 0;
  margin: 1em 0;
}

blockquote {
  margin: 1em 2em;
  font-style: italic;
}

hr {
  border: none;
  text-align: center;
  margin: 1em 0;
}

.title-page {
  text-align: center;
  margin-top: 30%;
}

.title-page .book-title {
  font-size: 2em;
  font-weight: bold;
  margin: 0 0 0.5em;
  text-indent: 0;
}

.title-page .book-subtitle {
  font-size: 1.1em;
  margin: 0 0 2em;
  text-indent: 0;
}

.title-page .book-author {
  font-size: 1.2em;
  margin: 0;
  text-indent: 0;
}

.cover-page {
  text-align: center;
  margin: 0;
  padding: 0;
}

.cover-page img {
  max-width: 100%;
  max-height: 100%;
}

.contents-page h1 {
  text-align: center;
  margin: 2em 0 1.5em;
}

.contents-page ol {
  list-style: none;
  margin: 0 0 0 1.25em;
  padding: 0;
}

.contents-page > ol {
  margin-left: 0;
}

.contents-page li {
  margin: 0.45em 0;
  text-indent: 0;
}

.contents-page a {
  text-decoration: none;
}
`

// Groups compile nodes into one XHTML file per chapter/act heading. Scenes
// before any heading land in a leading section titled after the book.
function buildSections(nodes: EpubCompileNode[], options: EpubOptions): { sections: EpubSection[]; tocItems: TocItem[] } {
  const sections: EpubSection[] = []
  const tocItems: TocItem[] = []
  let sceneIndex = 1
  let current: { title: string; role: 'act' | 'chapter' | 'lead'; depth: number; parts: string[]; tocItems: TocItem[] } | null = null

  const flush = () => {
    if (!current) return
    const index = sections.length + 1
    const id = `section-${String(index).padStart(3, '0')}`
    const headingClass = current.role === 'act' ? 'act-title' : 'chapter-title'
    const heading = current.role === 'lead' ? '' : `<h1 class="${headingClass}">${escapeXml(current.title)}</h1>\n`
    sections.push({
      id,
      filename: `${id}.xhtml`,
      title: current.title,
      bodyXhtml: chapterXhtml(current.title, heading + current.parts.join('\n')),
    })
    if (current.role !== 'lead') {
      tocItems.push({
        label: current.title,
        href: `${id}.xhtml`,
        depth: current.depth,
      })
    }
    tocItems.push(...current.tocItems.map(item => ({
      ...item,
      href: `${id}.xhtml#${item.href}`,
    })))
    current = null
  }

  for (const node of nodes) {
    if (node.type === 'heading') {
      flush()
      current = { title: node.label, role: node.role, depth: node.depth, parts: [], tocItems: [] }
      continue
    }
    if (!current) current = { title: options.title, role: 'lead', depth: 0, parts: [], tocItems: [] }
    if (options.includeSceneTitles) {
      const sceneId = `scene-${String(sceneIndex).padStart(3, '0')}`
      sceneIndex += 1
      current.parts.push(`<h2 id="${sceneId}" class="scene-title">${escapeXml(node.label)}</h2>`)
      current.tocItems.push({
        label: node.label,
        href: sceneId,
        depth: current.role === 'lead' ? current.depth : current.depth + 1,
      })
    } else if (current.parts.length > 0) {
      current.parts.push('<p class="scene-break">* * *</p>')
    }
    current.parts.push(sceneHtmlToXhtml(node.html))
  }
  flush()

  if (tocItems.length === 0) {
    tocItems.push(...sections.map(section => ({
      label: section.title,
      href: section.filename,
      depth: 0,
    })))
  }

  return { sections, tocItems }
}

function titlePageXhtml(options: EpubOptions) {
  return chapterXhtml(options.title, `<div class="title-page">
  <p class="book-title">${escapeXml(options.title)}</p>
  ${options.subtitle ? `<p class="book-subtitle">${escapeXml(options.subtitle)}</p>` : ''}
  ${options.author ? `<p class="book-author">${escapeXml(options.author)}</p>` : ''}
</div>`)
}

function coverXhtml(coverFilename: string) {
  return chapterXhtml('Cover', `<div class="cover-page">
  <img src="${coverFilename}" alt="Cover"/>
</div>`)
}

function normalizeTocDepths(items: TocItem[]) {
  const minDepth = Math.min(...items.map(item => item.depth))
  return items.map(item => ({ ...item, depth: Math.max(0, item.depth - minDepth) }))
}

function tocList(items: TocItem[], indent = '    ') {
  if (items.length === 0) return ''
  const normalized = normalizeTocDepths(items)
  const lines: string[] = [`${indent}<ol>`]
  const stack = [0]

  normalized.forEach((item, index) => {
    const depth = Math.max(0, item.depth)
    const nextDepth = normalized[index + 1]?.depth ?? 0

    while (stack.length - 1 > depth) {
      lines.push(`${indent}${'  '.repeat(stack.length - 1)}</ol>`)
      lines.push(`${indent}${'  '.repeat(stack.length - 2)}</li>`)
      stack.pop()
    }

    lines.push(`${indent}${'  '.repeat(depth + 1)}<li><a href="${item.href}">${escapeXml(item.label)}</a>`)
    if (nextDepth > depth) {
      lines.push(`${indent}${'  '.repeat(depth + 2)}<ol>`)
      stack.push(nextDepth)
    } else {
      lines[lines.length - 1] += '</li>'
    }
  })

  while (stack.length > 1) {
    lines.push(`${indent}${'  '.repeat(stack.length - 1)}</ol>`)
    lines.push(`${indent}${'  '.repeat(stack.length - 2)}</li>`)
    stack.pop()
  }

  lines.push(`${indent}</ol>`)
  return lines.join('\n')
}

function navXhtml(tocItems: TocItem[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc" class="contents-page">
  <h1>Contents</h1>
${tocList(tocItems, '  ')}
  </nav>
</body>
</html>
`
}

function ncx(tocItems: TocItem[], options: EpubOptions, uid: string) {
  const navPoints = normalizeTocDepths(tocItems).map((item, index) => `    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(item.label)}</text></navLabel>
      <content src="${item.href}"/>
    </navPoint>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uid}"/>
    <meta name="dtb:depth" content="${tocItems.length > 0 ? Math.max(...normalizeTocDepths(tocItems).map(item => item.depth)) + 1 : 1}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(options.title)}</text></docTitle>
  ${options.author ? `<docAuthor><text>${escapeXml(options.author)}</text></docAuthor>` : ''}
  <navMap>
${navPoints}
  </navMap>
</ncx>
`
}

function contentOpf(sections: EpubSection[], options: EpubOptions, uid: string, includeTitlePage: boolean, coverFilename: string | null) {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const manifestItems = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '    <item id="css" href="style.css" media-type="text/css"/>',
    ...(coverFilename && options.cover
      ? [
        `    <item id="cover-image" href="${coverFilename}" media-type="${options.cover.mediaType}" properties="cover-image"/>`,
        '    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>',
      ]
      : []),
    ...(includeTitlePage ? ['    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>'] : []),
    ...sections.map(section => `    <item id="${section.id}" href="${section.filename}" media-type="application/xhtml+xml"/>`),
  ].join('\n')
  const spineItems = [
    ...(coverFilename ? ['    <itemref idref="cover-page"/>'] : []),
    ...(includeTitlePage ? ['    <itemref idref="title-page"/>'] : []),
    '    <itemref idref="nav"/>',
    ...sections.map(section => `    <itemref idref="${section.id}"/>`),
  ].join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${options.language ?? 'en'}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${uid}</dc:identifier>
    <dc:title>${escapeXml(options.title)}</dc:title>
    ${options.author ? `<dc:creator>${escapeXml(options.author)}</dc:creator>` : ''}
    <dc:language>${options.language ?? 'en'}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    ${coverFilename ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>
`
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

export async function buildEpub(nodes: EpubCompileNode[], options: EpubOptions): Promise<Uint8Array> {
  const { sections, tocItems } = buildSections(nodes, options)
  const uid = crypto.randomUUID()
  const coverFilename = options.cover ? `cover.${options.cover.extension}` : null
  const zip = new JSZip()

  // The mimetype entry must be first in the archive and stored uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', CONTAINER_XML)
  zip.file('OEBPS/content.opf', contentOpf(sections, options, uid, options.frontMatter, coverFilename))
  zip.file('OEBPS/nav.xhtml', navXhtml(tocItems))
  zip.file('OEBPS/toc.ncx', ncx(tocItems, options, uid))
  zip.file('OEBPS/style.css', EPUB_CSS)
  if (options.cover && coverFilename) {
    zip.file(`OEBPS/${coverFilename}`, options.cover.bytes)
    zip.file('OEBPS/cover.xhtml', coverXhtml(coverFilename))
  }
  if (options.frontMatter) zip.file('OEBPS/title.xhtml', titlePageXhtml(options))
  for (const section of sections) {
    zip.file(`OEBPS/${section.filename}`, section.bodyXhtml)
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
