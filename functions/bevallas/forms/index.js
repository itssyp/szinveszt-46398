const form58 = require('./form58')

const FORMS = {
  '58': form58,
}

function getForm(code) {
  return FORMS[code] || null
}

module.exports = {
  FORMS,
  getForm,
}
