#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { summarize } from './measure.mjs'

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/measure-latency/cli.mjs <measurements.jsonl>')
  const lines = (await readFile(process.argv[2], 'utf8')).split(/\r?\n/).filter(line => line.trim())
  const records = lines.map(line => JSON.parse(line))
  console.log(JSON.stringify({ measurements: records.length, groups: summarize(records) }, null, 2))
} catch {
  // Never echo input lines or filesystem errors, which could contain sensitive material.
  console.error('Cannot summarize measurements: invalid input, duplicate measurement, or unreadable file.')
  process.exitCode = 1
}
