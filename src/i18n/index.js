import { hu } from './hu'

const locale = hu

export const i18n = locale

function lookup(path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), locale)
}

export function t(key, params = {}) {
  const value = lookup(key)
  if (typeof value !== 'string') return key
  return value.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`))
}
