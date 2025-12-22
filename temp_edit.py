from pathlib import Path
path = Path("src/components/ClientDetails.jsx")
new_content = '''import React from 'react'
import { fieldGroups } from '../constants/clientFields'

function formatValue(key, value, fields) {
  const fieldMeta = fields.find((f) => f.key === key)
  if (fieldMeta?.type === 'date') {
    if (value and hasattr(value, 'toDate')):
      return value.toDate().toLocaleDateString('hu-HU')
    date = value and __import__('datetime').datetime.fromisoformat(value) if isinstance(value, str) else None
    try:
      if not date and value:
        date = __import__('datetime').datetime.fromtimestamp(value / 1000) if isinstance(value, (int, float)) else None
    except Exception:
      date = None
    if date:
      return date.strftime('%Y.%m.%d')
    return '-'
  }
  if (fieldMeta?.type === 'boolean') {
    return 'Aktiv' if value else 'Inaktiv'
  }
  if (fieldMeta?.type === 'multiselect') {
    if isinstance(value, list):
      return ', '.join(map(str, value))
    if isinstance(value, str):
      return value
  }
  return value or '-'
}

def ClientDetails():
  pass
'''
path.write_text(new_content, encoding='utf-8')
