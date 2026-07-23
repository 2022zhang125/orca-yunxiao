import { describe, expect, it } from 'vitest'
import { unwrapWorkItemDescription } from './work-item-description'

describe('yunxiao work item description envelope', () => {
  it('unwraps the rich-text editor envelope down to its html', () => {
    const envelope = JSON.stringify({
      htmlValue: '<article class="4ever-article"><p>复现步骤：登录管理端</p></article>',
      jsonMLValue: ['root', {}, ['p', {}, '复现步骤：登录管理端']]
    })
    expect(unwrapWorkItemDescription(envelope)).toBe(
      '<article class="4ever-article"><p>复现步骤：登录管理端</p></article>'
    )
  })

  it('falls back to the text value when the envelope carries no html', () => {
    expect(unwrapWorkItemDescription(JSON.stringify({ textValue: 'plain body' }))).toBe(
      'plain body'
    )
  })

  it('drops an envelope it cannot read rather than printing raw json', () => {
    expect(unwrapWorkItemDescription(JSON.stringify({ jsonMLValue: ['root', {}] }))).toBeUndefined()
  })

  it('passes plain descriptions through untouched', () => {
    expect(unwrapWorkItemDescription('<p>Just HTML</p>')).toBe('<p>Just HTML</p>')
    expect(unwrapWorkItemDescription('{not json after all')).toBe('{not json after all')
    expect(unwrapWorkItemDescription('   ')).toBeUndefined()
    expect(unwrapWorkItemDescription(undefined)).toBeUndefined()
  })
})
