import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { RouteEntry } from './route-registry'
import { ROUTE_ENTRIES } from './route-registry'

const requireFromHere = createRequire(__filename)
const ROUTES_ROOT = path.join(__dirname, 'routes')

const DYNAMIC_SEGMENT = /^\[[^/]+\]$/

export function pathToSegments(urlPath: string): string[] {
  return urlPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
}

function segmentPatternToRegex(segment: string): string {
  if (segment.startsWith(':')) {
    return '[^/]+'
  }
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function matchRouteEntry(segments: string[]): RouteEntry | null {
  for (const entry of ROUTE_ENTRIES) {
    if (entry.segments.length !== segments.length) continue

    let matched = true
    for (let i = 0; i < entry.segments.length; i++) {
      const expected = entry.segments[i]!
      const actual = segments[i]!
      if (expected.startsWith(':')) continue
      if (expected !== actual) {
        matched = false
        break
      }
    }

    if (matched) return entry
  }

  return null
}

export function resolveRouteFileByFilesystem(segments: string[]): string | null {
  let dir = ROUTES_ROOT

  for (const segment of segments) {
    const exactDir = path.join(dir, segment)
    if (fs.existsSync(exactDir) && fs.statSync(exactDir).isDirectory()) {
      dir = exactDir
      continue
    }

    const children = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())

    const dynamicDir = children.find((entry) => DYNAMIC_SEGMENT.test(entry.name))
    if (!dynamicDir) return null

    dir = path.join(dir, dynamicDir.name)
  }

  const candidates = ['route.js', 'route.ts']
  for (const name of candidates) {
    const filePath = path.join(dir, name)
    if (fs.existsSync(filePath)) return filePath
  }

  return null
}

export function resolveRouteImportPath(segments: string[]): string | null {
  const entry = matchRouteEntry(segments)
  if (entry) return entry.importPath

  const filePath = resolveRouteFileByFilesystem(segments)
  if (!filePath) return null

  const relative = path.relative(path.join(__dirname), filePath)
  return relative.replace(/\.(ts|js)$/, '')
}

export async function loadRouteModule(importPath: string) {
  const absoluteJs = path.join(__dirname, `${importPath}.js`)
  const absoluteTs = path.join(__dirname, `${importPath}.ts`)

  const filePath = fs.existsSync(absoluteJs)
    ? absoluteJs
    : fs.existsSync(absoluteTs)
      ? absoluteTs
      : null

  if (!filePath) {
    throw new Error(`Route module not found: ${importPath}`)
  }

  // CJS require — Nest emits CommonJS; dynamic import(file://) fails for these paths.
  return requireFromHere(filePath)
}

export function entryPatternToRegExp(entry: RouteEntry): RegExp {
  const pattern = entry.segments.map(segmentPatternToRegex).join('/')
  return new RegExp(`^/${pattern}$`)
}
