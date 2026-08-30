/** Minimal 5-field cron matcher: min hour dom mon dow (UTC). */
export function cronMatches(expr: string, date = new Date()): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`invalid cron (need 5 fields): ${expr}`)
  const [min, hour, dom, mon, dow] = parts
  const vals = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay(),
  ]
  const fields = [min, hour, dom, mon, dow]
  return fields.every((f, i) => fieldMatches(f, vals[i]!))
}

function fieldMatches(field: string, value: number): boolean {
  if (field === '*') return true
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/')
      const step = Number(stepStr)
      if (!step) return false
      const start = range === '*' ? 0 : Number(range)
      if (value >= start && (value - start) % step === 0) return true
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      if (value >= a! && value <= b!) return true
    } else if (Number(part) === value) {
      return true
    }
  }
  return false
}
