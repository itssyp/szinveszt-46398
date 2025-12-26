function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildXml({ client, period, aggregates, incomes }) {
  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<Bevallas58>')
  lines.push(`  <Period>${escapeXml(period)}</Period>`)
  lines.push('  <Client>')
  lines.push(`    <Name>${escapeXml(client.nev || '')}</Name>`)
  lines.push(`    <TaxNumber>${escapeXml(client.adoszam || '')}</TaxNumber>`)
  lines.push('  </Client>')
  lines.push('  <Summary>')
  lines.push(`    <IncomeCount>${aggregates.incomeCount}</IncomeCount>`)
  lines.push(`    <TotalIncomeHUF>${aggregates.totalIncomeHuf.toFixed(2)}</TotalIncomeHUF>`)
  lines.push('  </Summary>')
  lines.push('  <Incomes>')
  incomes.forEach((inc) => {
    lines.push('    <Income>')
    lines.push(`      <Date>${escapeXml(inc.date)}</Date>`)
    lines.push(`      <Amount>${Number(inc.amount || 0).toFixed(2)}</Amount>`)
    lines.push(`      <Currency>${escapeXml(inc.currency || 'HUF')}</Currency>`)
    lines.push('    </Income>')
  })
  lines.push('  </Incomes>')
  lines.push('</Bevallas58>')
  return lines.join('\n')
}

module.exports = { buildXml }
