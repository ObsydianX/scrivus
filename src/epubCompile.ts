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
`

// Groups compile nodes into one XHTML file per chapter/act heading. Scenes
// before any heading land in a leading section titled after the book.
function buildSections(nodes: EpubCompileNode[], options: EpubOptions): EpubSection[] {
  const sections: EpubSection[] = []
  let current: { title: string; role: 'act' | 'chapter' | 'lead'; parts: string[] } | null = null

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
    current = null
  }

  for (const node of nodes) {
    if (node.type === 'heading') {
      flush()
      current = { title: node.label, role: node.role, parts: [] }
      continue
    }
    if (!current) current = { title: options.title, role: 'lead', parts: [] }
    if (options.includeSceneTitles) {
      current.parts.push(`<h2 class="scene-title">${escapeXml(node.label)}</h2>`)
    } else if (current.parts.length > 0) {
      current.parts.push('<p class="scene-break">* * *</p>')
    }
    current.parts.push(sceneHtmlToXhtml(node.html))
  }
  flush()

  return sections
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

function navXhtml(sections: EpubSection[], includeTitlePage: boolean) {
  const items = [
    ...(includeTitlePage ? ['    <li><a href="title.xhtml">Title Page</a></li>'] : []),
    ...sections.map(section => `    <li><a href="${section.filename}">${escapeXml(section.title)}</a></li>`),
  ].join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
${items}
  </ol>
  </nav>
</body>
</html>
`
}

function contentOpf(sections: EpubSection[], options: EpubOptions, uid: string, includeTitlePage: boolean, coverFilename: string | null) {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const manifestItems = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
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
  <spine>
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
  const sections = buildSections(nodes, options)
  const uid = crypto.randomUUID()
  const coverFilename = options.cover ? `cover.${options.cover.extension}` : null
  const zip = new JSZip()

  // The mimetype entry must be first in the archive and stored uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', CONTAINER_XML)
  zip.file('OEBPS/content.opf', contentOpf(sections, options, uid, options.frontMatter, coverFilename))
  zip.file('OEBPS/nav.xhtml', navXhtml(sections, options.frontMatter))
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
