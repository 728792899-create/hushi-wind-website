const serialize = (level, message, fields = {}) => JSON.stringify({
  timestamp: new Date().toISOString(),
  level,
  service: process.env.SERVICE_NAME || 'hushi-api',
  environment: process.env.NODE_ENV || 'development',
  message,
  ...fields
})

const write = (level, message, fields) => {
  const line = serialize(level, message, fields)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

module.exports = {
  error: (message, fields) => write('error', message, fields),
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields)
}
