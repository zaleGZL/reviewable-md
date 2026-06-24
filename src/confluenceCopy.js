function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function cdata(text) {
  return String(text).replaceAll(']]>', ']]]]><![CDATA[>')
}

function unwrapHighlights(root) {
  root.querySelectorAll('mark.rmd-highlight').forEach((mark) => {
    const parent = mark.parentNode
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}

function mermaidMacro(source) {
  return `<p class="code-line"><br /></p><ac:structured-macro ac:name="mermaid-macro" ac:schema-version="1" ac:macro-id="${uuid()}"><ac:plain-text-body><![CDATA[${cdata(source)}]]></ac:plain-text-body></ac:structured-macro><p class="code-line"><br /></p>`
}

function svgDataUrlFromText(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
}

function replaceMermaidBlocks(root) {
  const macros = new Map()
  root.querySelectorAll('.rmd-mermaid').forEach((node) => {
    const source = node.getAttribute('data-mermaid-source') || ''
    const key = `rmd-confluence-${macros.size}`
    const placeholder = root.ownerDocument.createElement('span')
    placeholder.setAttribute('data-rmd-confluence-placeholder', key)
    macros.set(key, mermaidMacro(source))
    node.replaceWith(placeholder)
  })
  return macros
}

async function svgToPngDataUrl(svg) {
  const svgText = new XMLSerializer().serializeToString(svg)
  const svgDataUrl = svgDataUrlFromText(svgText)
  return svgToPngDataUrlFromText(svg, svgText, svgDataUrl)
}

async function svgToPngDataUrlFromText(svg, svgText, fallbackDataUrl) {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const image = new Image()
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
    })
    image.src = url
    await loaded

    const rect = svg.getBoundingClientRect?.()
    const width = image.naturalWidth || parseFloat(svg.getAttribute('width')) || rect?.width || 1200
    const height = image.naturalHeight || parseFloat(svg.getAttribute('height')) || rect?.height || 800
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width)
    canvas.height = Math.ceil(height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    try {
      return canvas.toDataURL('image/png')
    } catch (error) {
      if (error?.name === 'SecurityError') return fallbackDataUrl
      throw error
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function replaceMermaidBlocksWithImages(root, convertSvg = svgToPngDataUrl) {
  const blocks = Array.from(root.querySelectorAll('.rmd-mermaid'))
  for (const node of blocks) {
    const source = node.getAttribute('data-mermaid-source') || ''
    const svg = node.querySelector('svg')

    if (!svg) {
      const pre = root.ownerDocument.createElement('pre')
      pre.textContent = source
      node.replaceWith(pre)
      continue
    }

    const img = root.ownerDocument.createElement('img')
    try {
      img.src = await convertSvg(svg)
    } catch (error) {
      if (error?.name !== 'SecurityError') throw error
      img.src = svgDataUrlFromText(new XMLSerializer().serializeToString(svg))
    }
    img.alt = 'Mermaid diagram'
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    node.replaceWith(img)
  }
}

function stripAppOnlyAttributes(root) {
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'data-rmd-confluence-placeholder') continue
      if (attr.name === 'id' || attr.name.startsWith('data-') || attr.name === 'aria-hidden') {
        el.removeAttribute(attr.name)
      }
    }
  })
}

export function buildConfluenceStorageHtml(contentNode) {
  if (!contentNode) throw new Error('Missing rendered markdown content')
  const clone = contentNode.cloneNode(true)
  unwrapHighlights(clone)
  const macros = replaceMermaidBlocks(clone)
  stripAppOnlyAttributes(clone)
  let html = clone.innerHTML
  for (const [key, macro] of macros) {
    html = html.replace(`<span data-rmd-confluence-placeholder="${key}"></span>`, macro)
  }
  return html
}

export async function buildConfluenceHtml(contentNode, options = {}) {
  if (!contentNode) throw new Error('Missing rendered markdown content')
  const clone = contentNode.cloneNode(true)
  unwrapHighlights(clone)
  await replaceMermaidBlocksWithImages(clone, options.convertSvg)
  stripAppOnlyAttributes(clone)
  return clone.innerHTML
}

export function buildConfluencePlainText(contentNode) {
  if (!contentNode) throw new Error('Missing rendered markdown content')
  const clone = contentNode.cloneNode(true)
  unwrapHighlights(clone)
  clone.querySelectorAll('.rmd-mermaid').forEach((node) => {
    const source = node.getAttribute('data-mermaid-source') || ''
    const pre = clone.ownerDocument.createElement('pre')
    pre.textContent = source
    node.replaceWith(pre)
  })
  return clone.textContent || ''
}

export async function copyConfluenceContent(contentNode) {
  const html = await buildConfluenceHtml(contentNode)
  const plain = buildConfluencePlainText(contentNode)

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ])
    return { html, plain, mode: 'rich' }
  }

  await navigator.clipboard.writeText(plain)
  return { html, plain, mode: 'plain' }
}

export async function copyConfluenceSource(contentNode) {
  const source = buildConfluenceStorageHtml(contentNode)
  await navigator.clipboard.writeText(source)
  return { source, mode: 'source' }
}
