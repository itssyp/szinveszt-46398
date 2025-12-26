import React from 'react'

function ClientForm({ fields, groups, formData, onChange, onSubmit, onReset, editingId, saving }) {
  const fieldMap = fields.reduce((acc, f) => ({ ...acc, [f.key]: f }), {})

  const renderField = (field) => {
    const value = formData[field.key]
    const commonProps = {
      id: field.key,
      name: field.key,
    }

    if (field.type === 'multiselect') {
      return (
        <label key={field.key} className="form-field">
          <span>{field.label}</span>
          <select
            {...commonProps}
            multiple
            value={Array.isArray(value) ? value : []}
            onChange={(e) =>
              onChange(
                field.key,
                Array.from(e.target.selectedOptions, (opt) => opt.value)
              )
            }
          >
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      )
    }

    if (field.type === 'select') {
      return (
        <label key={field.key} className="form-field">
          <span>{field.label}</span>
          <select
            {...commonProps}
            value={value || ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          >
            <option value="">Válassz...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      )
    }

    if (field.type === 'boolean') {
      return (
        <label key={field.key} className="form-field checkbox-field">
          <div className="switch">
            <input
              {...commonProps}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(field.key, e.target.checked)}
            />
            <span className="switch-slider" />
          </div>
          <span>{field.label}</span>
        </label>
      )
    }

    return (
      <label key={field.key} className="form-field">
        <span>{field.label}</span>
        <input
          {...commonProps}
          type={field.type === 'date' ? 'date' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.label}
        />
      </label>
    )
  }

  return (
    <div className="form-shell">
      <form onSubmit={onSubmit} className="client-form">
        {groups.map((group) => (
          <div key={group.title} className="form-section">
            <h3>{group.title}</h3>
            <div className="form-grid">
              {group.keys.map((key) => (fieldMap[key] ? renderField(fieldMap[key]) : null))}
            </div>
          </div>
        ))}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Mentés...' : editingId ? 'Mentés' : 'Hozzáadás'}
          </button>
          <button type="button" className="btn ghost" onClick={onReset} disabled={saving}>
            Mégse
          </button>
        </div>
      </form>
    </div>
  )
}

export default ClientForm
