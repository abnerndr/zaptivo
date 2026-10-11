const DEFAULT_COLOR = '#64748b'
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function parseContactTypeInput(input: {
  name: unknown
  color: unknown
}):
  | { ok: true; name: string; color: string }
  | { ok: false; error: string } {
  if (typeof input.name !== 'string') {
    return { ok: false, error: 'Nome obrigatório' }
  }

  const name = input.name.trim()

  if (name.length === 0) {
    return { ok: false, error: 'Nome obrigatório' }
  }

  if (name.length > 40) {
    return { ok: false, error: 'Nome longo demais' }
  }

  const colorRaw = input.color
  let color: string

  if (colorRaw === undefined || colorRaw === null || colorRaw === '') {
    color = DEFAULT_COLOR
  } else if (typeof colorRaw !== 'string' || !HEX_COLOR_RE.test(colorRaw)) {
    return { ok: false, error: 'Cor inválida' }
  } else {
    color = colorRaw
  }

  return { ok: true, name, color }
}
