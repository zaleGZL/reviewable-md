// @vitest-environment jsdom
import './setup.js'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the lazily-imported mermaid module. render() is controlled per test.
const renderMock = vi.fn()
const initializeMock = vi.fn()
vi.mock('mermaid', () => ({
  default: {
    initialize: (...a) => initializeMock(...a),
    render: (...a) => renderMock(...a),
  },
}))

// Mermaid caches the mermaid import in a module-level promise, so reset the
// module registry before each test to get a fresh (un-initialized) component.
async function freshMermaid() {
  vi.resetModules()
  return (await import('../src/Mermaid.jsx')).default
}

beforeEach(() => {
  renderMock.mockReset()
  initializeMock.mockReset()
})

describe('Mermaid', () => {
  it('renders the diagram SVG returned by mermaid', async () => {
    renderMock.mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>' })
    const Mermaid = await freshMermaid()
    const { container } = render(<Mermaid code="flowchart LR; A-->B" />)

    await waitFor(() => {
      expect(container.querySelector('.rmd-mermaid svg')).toBeTruthy()
    })
    expect(renderMock).toHaveBeenCalledWith(expect.any(String), 'flowchart LR; A-->B')
  })

  it('initializes mermaid before rendering', async () => {
    renderMock.mockResolvedValue({ svg: '<svg></svg>' })
    const Mermaid = await freshMermaid()
    render(<Mermaid code="graph TD; X-->Y" />)
    await waitFor(() => expect(initializeMock).toHaveBeenCalled())
    const opts = initializeMock.mock.calls[0][0]
    expect(opts.startOnLoad).toBe(false)
    expect(opts.securityLevel).toBe('strict')
  })

  it('falls back to the raw source when the diagram fails to parse', async () => {
    renderMock.mockRejectedValue(new Error('Parse error on line 1'))
    const Mermaid = await freshMermaid()
    const { container } = render(<Mermaid code="not a valid diagram" />)

    await waitFor(() => {
      expect(screen.getByText('not a valid diagram')).toBeInTheDocument()
    })
    // The fallback uses a <pre class="rmd-mermaid-error"> and no diagram div.
    expect(container.querySelector('pre.rmd-mermaid-error')).toBeTruthy()
    expect(container.querySelector('.rmd-mermaid')).toBeNull()
  })

  it('opens an expanded zoomable diagram view', async () => {
    const user = userEvent.setup()
    renderMock.mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>' })
    const Mermaid = await freshMermaid()
    render(<Mermaid code="flowchart LR; A-->B" />)

    await screen.findByTestId('diagram')
    await user.click(screen.getByRole('button', { name: 'Expand diagram' }))
    expect(screen.getByRole('dialog', { name: 'Expanded Mermaid diagram' })).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(screen.getByText('100%')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close expanded diagram' }))
    expect(screen.queryByRole('dialog', { name: 'Expanded Mermaid diagram' })).toBeNull()
  })
})
