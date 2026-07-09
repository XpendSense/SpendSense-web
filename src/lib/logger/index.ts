type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  action: string
  data?: Record<string, unknown>
  timestamp: string
}

function log(level: LogLevel, action: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = { level, action, data, timestamp: new Date().toISOString() }

  if (process.env.NODE_ENV !== 'production') {
    console[level](`[WellSpent] ${action}`, data ?? '')
  } else {
    // TODO: forward to a logging service (e.g. Datadog, Sentry)
    console[level](JSON.stringify(entry))
  }
}

export const logger = {
  info: (action: string, data?: Record<string, unknown>) => log('info', action, data),
  warn: (action: string, data?: Record<string, unknown>) => log('warn', action, data),
  error: (action: string, data?: Record<string, unknown>) => log('error', action, data),
}
