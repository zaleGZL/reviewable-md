import { describe, it, expect } from 'vitest'
import config, { apiProxyTarget } from '../vite.config.js'

describe('vite config', () => {
  it('proxies API requests to the local review server port', async () => {
    expect(apiProxyTarget('29999')).toBe('http://127.0.0.1:29999')
    expect(config.server.proxy['/api']).toBe('http://127.0.0.1:27174')
  })
})
