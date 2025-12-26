function parsePeriod(period) {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Invalid period format, expected YYYY-MM')
  }
  const [yearStr, monthStr] = period.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr) - 1
  if (month < 0 || month > 11) throw new Error('Invalid month in period')
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0))
  return { year, month: month + 1, start, end }
}

module.exports = { parsePeriod }
