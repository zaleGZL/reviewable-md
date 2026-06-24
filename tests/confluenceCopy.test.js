// @vitest-environment jsdom
import './setup.js'
import { describe, it, expect, vi } from 'vitest'
import {
  buildConfluenceHtml,
  buildConfluencePlainText,
  buildConfluenceStorageHtml,
  copyConfluenceContent,
  copyConfluenceSource,
} from '../src/confluenceCopy.js'

function content(html) {
  const node = document.createElement('article')
  node.innerHTML = html
  return node
}

describe('buildConfluenceHtml', () => {
  it('keeps standard markdown HTML and removes review highlights', async () => {
    const node = content('<h1>Title</h1><p>Hello <mark class="rmd-highlight" data-comment-id="c1">world</mark>.</p>')

    const html = await buildConfluenceHtml(node)

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<p>Hello world.</p>')
    expect(html).not.toContain('rmd-highlight')
    expect(html).not.toContain('data-comment-id')
  })

  it('converts rendered Mermaid blocks to PNG images by default', async () => {
    const node = content('<div class="rmd-mermaid" data-mermaid-source="flowchart TD&#10;A --> B"><svg></svg></div>')

    const html = await buildConfluenceHtml(node, {
      convertSvg: async () => 'data:image/png;base64,test',
    })

    expect(html).toContain('<img')
    expect(html).toContain('src="data:image/png;base64,test"')
    expect(html).toContain('alt="Mermaid diagram"')
    expect(html).not.toContain('ac:structured-macro')
    expect(html).not.toContain('flowchart TD')
  })

  it('falls back to Mermaid source when a rendered SVG is unavailable', async () => {
    const node = content('<div class="rmd-mermaid" data-mermaid-source="flowchart TD&#10;A --> B"></div>')

    const html = await buildConfluenceHtml(node)

    expect(html).toContain('<pre>flowchart TD\nA --&gt; B</pre>')
  })

  it('falls back to an SVG image when canvas PNG export is blocked', async () => {
    const error = new DOMException('blocked', 'SecurityError')
    const node = content('<div class="rmd-mermaid" data-mermaid-source="flowchart TD"><svg><text>A</text></svg></div>')

    const html = await buildConfluenceHtml(node, {
      convertSvg: async () => {
        throw error
      },
    })

    expect(html).toContain('<img')
    expect(html).toContain('src="data:image/svg+xml')
    expect(html).toContain('alt="Mermaid diagram"')
  })
})

describe('buildConfluenceStorageHtml', () => {
  it('converts rendered Mermaid blocks to Confluence Mermaid macro storage', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('macro-id-1')
    const source = 'flowchart TD\n  A --> B'
    const node = content(`<div class="rmd-mermaid" data-mermaid-source="${source.replace('\n', '&#10;')}"><svg></svg></div>`)

    const html = buildConfluenceStorageHtml(node)

    expect(html).toContain('ac:structured-macro')
    expect(html).toContain('ac:name="mermaid-macro"')
    expect(html).toContain('ac:macro-id="macro-id-1"')
    expect(html).toContain('<![CDATA[flowchart TD\n  A --> B]]>')
  })

  it('escapes CDATA endings inside Mermaid source', () => {
    const node = content('<div class="rmd-mermaid" data-mermaid-source="flowchart TD ]]&gt; A"></div>')

    const html = buildConfluenceStorageHtml(node)

    expect(html).toContain(']]]]><![CDATA[>')
  })
})

describe('buildConfluencePlainText', () => {
  it('uses Mermaid source in the plain-text fallback', () => {
    const node = content('<p>Before</p><div class="rmd-mermaid" data-mermaid-source="flowchart TD&#10;A --> B"></div><p>After</p>')

    expect(buildConfluencePlainText(node)).toContain('flowchart TD\nA --> B')
  })
})

describe('copyConfluenceContent', () => {
  it('writes rich HTML and plain text to the clipboard', async () => {
    const node = content('<h1>Title</h1>')
    const write = vi.fn().mockResolvedValue()
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const originalClipboardItem = globalThis.ClipboardItem

    class TestClipboardItem {
      constructor(items) {
        this.items = items
      }
    }

    Object.defineProperty(navigator, 'clipboard', {
      value: { write },
      configurable: true,
    })
    globalThis.ClipboardItem = TestClipboardItem

    await copyConfluenceContent(node)

    expect(write).toHaveBeenCalledWith([expect.any(TestClipboardItem)])
    expect(write.mock.calls[0][0][0].items['text/html']).toBeInstanceOf(Blob)
    expect(write.mock.calls[0][0][0].items['text/plain']).toBeInstanceOf(Blob)

    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete navigator.clipboard
    globalThis.ClipboardItem = originalClipboardItem
  })
})

describe('copyConfluenceSource', () => {
  it('writes Confluence storage HTML to the clipboard for Source Editor paste', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('macro-id-2')
    const writeText = vi.fn().mockResolvedValue()
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const node = content('<h1>Title</h1><div class="rmd-mermaid" data-mermaid-source="flowchart TD&#10;A --> B"><svg></svg></div>')
    const result = await copyConfluenceSource(node)

    expect(result.mode).toBe('source')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('<h1>Title</h1>'))
    expect(writeText.mock.calls[0][0]).toContain('ac:name="mermaid-macro"')
    expect(writeText.mock.calls[0][0]).toContain('<![CDATA[flowchart TD\nA --> B]]>')

    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete navigator.clipboard
  })
})
