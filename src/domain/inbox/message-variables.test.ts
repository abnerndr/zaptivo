import { describe, expect, it } from 'vitest'
import { renderInboxMessage } from './message-variables'

describe('renderInboxMessage', () => {
  it('renders all supported values and repeated variables without expanding contact data', () => {
    const result = renderInboxMessage('{{name}} / {{first_name}} / {{phone}} / {{email}} / {{company}} / {{name}}', {
      name: ' Ana Silva ', phone: '5511999990000', email: 'ana@example.com', company: '{{name}} Ltda',
    })
    expect(result.text).toBe('Ana Silva / Ana / 5511999990000 / ana@example.com / {{name}} Ltda / Ana Silva')
    expect(result.missing).toEqual([])
    expect(result.unknown).toEqual([])
  })

  it('identifies missing and unknown values without removing them', () => {
    const result = renderInboxMessage('Olá {{ name }}, {{email}} {{email}} {{other}}', { name: ' ', phone: '123456789012345' })
    expect(result.text).toBe('Olá {{ name }}, {{email}} {{email}} {{other}}')
    expect(result.missing).toEqual(['name', 'email'])
    expect(result.unknown).toEqual(['other'])
    expect(renderInboxMessage('{{phone}}', { phone: '123456789012345' }).missing).toEqual(['phone'])
  })
})
