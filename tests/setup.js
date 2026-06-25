// Shared setup for jsdom-based component tests.
import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees between tests so DOM queries don't see stale nodes.
afterEach(() => cleanup())

// jsdom does not implement Range.getBoundingClientRect (no layout engine).
// App uses it to position the comment draft; return a zero rect so the flow
// proceeds in tests.
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => ({
    bottom: 0, top: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
  })
  Range.prototype.getClientRects = () => []
}

// jsdom has no matchMedia; provide a stub so components that query the color
// scheme don't crash.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent
}
