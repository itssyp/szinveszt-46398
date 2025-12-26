const { validateClient } = require('./validate')
const { buildXml } = require('./buildXml')

function computeAggregates(incomes) {
  const totalIncomeHuf = incomes.reduce((sum, inc) => sum + Number(inc.amount || 0), 0)
  return {
    totalIncomeHuf,
    incomeCount: incomes.length,
  }
}

function validateIncomes(incomes) {
  const messages = []
  if (!incomes.length) {
    messages.push('Nincs bevétel a periódusban.')
    return { ok: false, messages }
  }
  const nonHuf = incomes.filter((inc) => (inc.currency || 'HUF') !== 'HUF')
  if (nonHuf.length) {
    messages.push('Nem támogatott deviza: csak HUF engedélyezett.')
    return { ok: false, messages }
  }
  return { ok: true, messages }
}

module.exports = {
  code: '58',
  validateClient,
  buildXml,
  computeAggregates,
  validateIncomes,
}
