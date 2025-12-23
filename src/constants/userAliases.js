// Map Firebase user emails to friendly aliases/usernames shown in the app.
// Fill this with your real emails, e.g.:
// export const USER_ALIASES = {
//   'szindi@example.com': 'Szindi',
//   'fanni@example.com': 'Fanni',
// };
export const USER_ALIASES = {
  'barany.szilva@gmail.com': 'Szilveszter',
  'fanni@example.com': 'Fanni',
}

export const getAliasForEmail = (email) => {
  if (!email) return ''
  const lookup = USER_ALIASES[email.toLowerCase()]
  if (lookup) return lookup
  // Fallback: use the email local-part capitalized
  const local = email.split('@')[0] || email
  return local.charAt(0).toUpperCase() + local.slice(1)
}
