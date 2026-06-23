import { describe, it, expect } from 'vitest'
import { locateAnchor } from '../src/anchor.js'

describe('locateAnchor', () => {
  it('finds a simple quote', () => {
    const text = 'the quick brown fox'
    expect(locateAnchor(text, { quote: 'brown' })).toEqual({ start: 10, end: 15 })
  })

  it('returns null when the quote is absent', () => {
    expect(locateAnchor('hello world', { quote: 'missing' })).toBeNull()
  })

  it('returns null for an empty quote', () => {
    expect(locateAnchor('hello', { quote: '' })).toBeNull()
  })

  it('disambiguates repeated quotes using the suffix context', () => {
    // "cat" appears twice; suffix should pick the second occurrence.
    const text = 'a cat sat. a cat ran.'
    const pos = locateAnchor(text, { quote: 'cat', suffix: ' ran' })
    expect(text.slice(pos.start, pos.end)).toBe('cat')
    expect(pos.start).toBe(13) // the second "cat"
  })

  it('disambiguates repeated quotes using the prefix context', () => {
    const text = 'a cat sat. a cat ran.'
    const pos = locateAnchor(text, { quote: 'cat', prefix: 'a ' })
    // both are preceded by "a ", so it returns the first match — still valid.
    expect(text.slice(pos.start, pos.end)).toBe('cat')
  })

  it('prefers the match where both prefix and suffix agree', () => {
    const text = 'red car. blue car. red car here.'
    const pos = locateAnchor(text, { quote: 'car', prefix: 'blue ', suffix: '. red' })
    expect(pos.start).toBe(text.indexOf('blue car') + 'blue '.length)
  })

  it('falls back to the first occurrence when context does not match', () => {
    const text = 'foo bar foo'
    const pos = locateAnchor(text, { quote: 'foo', prefix: 'zzz', suffix: 'zzz' })
    expect(pos).toEqual({ start: 0, end: 3 })
  })
})
