import React, { useEffect, useMemo, useRef, useState } from 'react'
import { TbArrowDown, TbArrowUp, TbPlus, TbTrash } from 'react-icons/tb'
import { useClientSchema } from '../hooks/useClientSchema.jsx'
import { useUserProfile } from '../hooks/useUserProfile.jsx'

const FIELD_TYPES = ['text', 'select', 'multiselect', 'boolean', 'date']

const toKey = (label, fallback = 'customField') => {
  const clean = (label || '').toString().trim()
  if (!clean) return fallback
  const parts = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
  if (!parts.length) return fallback
  return parts
    .map((p, idx) => (idx === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join('')
}

function ClientSchemaPage() {
  const { fields, groups, defaultFieldKeys, loading, error, saving, saveSchema } = useClientSchema()
  const { profiles } = useUserProfile()
  const [localFields, setLocalFields] = useState([])
  const [localGroups, setLocalGroups] = useState([])
  const [status, setStatus] = useState('')
  const [localError, setLocalError] = useState('')
  const [newField, setNewField] = useState({ label: '', type: 'text', options: '', group: '' })
  const [inlineAddGroup, setInlineAddGroup] = useState('')
  const keyInputRef = useRef(null)

  useEffect(() => {
    setLocalFields(fields)
    setLocalGroups(groups)
  }, [fields, groups])

  const fieldMap = useMemo(
    () => localFields.reduce((acc, f) => ({ ...acc, [f.key]: f }), {}),
    [localFields]
  )
  const assigneeOptions = useMemo(() => {
    const names = (profiles || [])
      .map((p) => (p.username || p.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [profiles])
  const getMergedOptions = (field) => {
    if (!field || field.key !== 'hozzarendeltSzemely') return field?.options || []
    const baseOptions = Array.isArray(field.options) ? field.options : []
    return Array.from(new Set([...baseOptions, ...assigneeOptions]))
  }

  const moveGroup = (index, dir) => {
    const target = index + dir
    if (target < 0 || target >= localGroups.length) return
    const next = [...localGroups]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setLocalGroups(next)
  }

  const renameGroup = (index, title) => {
    setLocalGroups((prev) => prev.map((g, idx) => (idx === index ? { ...g, title } : g)))
  }

  const addGroupAt = (position) => {
    const next = [...localGroups]
    next.splice(position, 0, { title: 'Új csoport', keys: [] })
    setLocalGroups(next)
  }

  const removeGroup = (index) => {
    if (!localGroups.length) return
    const removed = localGroups[index]
    const remaining = localGroups.filter((_, idx) => idx !== index)
    const fallback = remaining[0] || { title: 'Egyéb', keys: [] }
    fallback.keys = [...fallback.keys, ...(removed?.keys || [])]
    const nextGroups = remaining.length ? [fallback, ...remaining.slice(1)] : [fallback]
    setLocalGroups(nextGroups)
  }

  const deleteField = (key) => {
    if (defaultFieldKeys.has(key)) return
    setLocalFields((prev) => prev.filter((f) => f.key !== key))
    setLocalGroups((prev) => prev.map((g) => ({ ...g, keys: g.keys.filter((k) => k !== key) })))
  }

  const handleFieldLabelChange = (key, label) => {
    setLocalFields((prev) => prev.map((f) => (f.key === key ? { ...f, label } : f)))
  }

  const handleFieldOptionsChange = (key, optionsText) => {
    setLocalFields((prev) =>
      prev.map((f) =>
        f.key === key ? { ...f, options: optionsText.split(',').map((o) => o.trim()).filter(Boolean) } : f
      )
    )
  }

  const handleFieldTypeChange = (key, type) => {
    setLocalFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, type, options: type.includes('select') ? f.options || [] : [] } : f))
    )
  }

  const addField = (targetGroupTitle) => {
    setStatus('')
    setLocalError('')
    const label = newField.label.trim()
    if (!label) {
      setLocalError('Adj meg nevet a mezőhöz.')
      return false
    }
    const generatedKey = toKey(label, `customField${localFields.length + 1}`)
    const key = generatedKey
    if (fieldMap[key]) {
      setLocalError('Ilyen mezőnév már létezik.')
      return false
    }
    const options = newField.type.includes('select')
      ? newField.options.split(',').map((o) => o.trim()).filter(Boolean)
      : []
    const field = {
      key,
      label,
      type: newField.type,
      options,
      system: false,
    }
    setLocalFields((prev) => [...prev, field])
    const targetTitle = targetGroupTitle || newField.group || (localGroups[0]?.title || 'Általános')
    if (!localGroups.length) {
      setLocalGroups([{ title: targetTitle, keys: [key] }])
    } else {
      setLocalGroups((prev) =>
        prev.map((g, idx) => (g.title === targetTitle || (idx === 0 && !newField.group) ? { ...g, keys: [...g.keys, key] } : g))
      )
    }
    setNewField({ label: '', type: 'text', options: '', group: targetTitle })
    setInlineAddGroup('')
    return true
  }

  useEffect(() => {
    if (keyInputRef.current) keyInputRef.current.focus()
  }, [newField.group])

  const handleSave = async () => {
    setStatus('')
    setLocalError('')
    const keys = localFields.map((f) => f.key)
    const unique = new Set(keys)
    if (unique.size !== keys.length) {
      setLocalError('Dupla mezőnév szerepel a mezők között.')
      return
    }
    try {
      await saveSchema(localFields, localGroups)
      setStatus('Séma elmentve.')
    } catch (e) {
      setLocalError(e?.message || 'Mentése sikertelen.')
    }
  }

  return (
    <main className="page-container slide-in-right">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <div className="section-header__intro">
            <p className="eyebrow">Ügyfél mezők</p>
            <h1 className="section-title">Ügyfél séma szerkesztő</h1>
            <p className="section-subtitle">
              Rendezd át a csoportokat és mezőket, adj hozzá újakat. Alap mezők nem törölhetők.
            </p>
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {localError ? <div className="banner banner-error">Hiba: {localError}</div> : null}
      {status ? <div className="banner banner-success">{status}</div> : null}

      <section className="content-grid">
        <div className="panel">
          <div className="details-header">
            <h3>Csoportok</h3>
            <div className="details-actions inline">
              <button className="btn" type="button" onClick={handleSave} disabled={saving || loading}>
                {saving ? 'Mentés...' : 'Séma mentése'}
              </button>
            </div>
          </div>

          <div className="form-shell">
            {localGroups.map((group, groupIndex) => (
              <React.Fragment key={`${group.title}-${groupIndex}`}>
                <div className="form-section schema-group">
                  <div className="details-header group-header">
                    <input
                      type="text"
                      value={group.title}
                      onChange={(e) => renameGroup(groupIndex, e.target.value)}
                      className="section-title group-title"
                      aria-label="Csoport neve"
                    />
                    <div className="details-actions inline">
                      <button
                        className="btn ghost icon-btn"
                        type="button"
                        onClick={() => moveGroup(groupIndex, -1)}
                        disabled={groupIndex === 0 || saving}
                      title="Fel"
                      >
                        <TbArrowUp />
                      </button>
                      <button
                        className="btn ghost icon-btn"
                        type="button"
                        onClick={() => moveGroup(groupIndex, 1)}
                        disabled={groupIndex === localGroups.length - 1 || saving}
                        title="Le"
                      >
                        <TbArrowDown />
                      </button>
                      <button
                        className="btn ghost danger icon-btn"
                        type="button"
                        onClick={() => removeGroup(groupIndex)}
                        disabled={saving || !localGroups.length}
                        title="Csoport törlése"
                      >
                        <TbTrash />
                      </button>
                    </div>
                  </div>
                  <div className="form-grid">
                    {group.keys.map((key) => {
                      const field = fieldMap[key]
                      if (!field) return null
                      const isDefault = defaultFieldKeys.has(key)
                      return (
                        <div className="schema-field-card" key={key}>
                          <label className="form-field field-label">
                            <span>Címke</span>
                            <div className="field-label-input">
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => handleFieldLabelChange(key, e.target.value)}
                                aria-label={`${field.label || 'Mező'} címke`}
                              />
                              <button
                                className="btn ghost danger icon-btn"
                                type="button"
                                onClick={() => deleteField(key)}
                                disabled={isDefault || saving}
                                title="Törlés"
                              >
                                <TbTrash />
                              </button>
                            </div>
                          </label>
                          <label className="form-field">
                            <span>Típus</span>
                            <select
                              value={field.type || 'text'}
                              onChange={(e) => handleFieldTypeChange(key, e.target.value)}
                              disabled={isDefault}
                            >
                              {FIELD_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          </label>
                          {(field.type === 'select' || field.type === 'multiselect') && (
                            <label className="form-field">
                              <span>Opció lista (vesszővel)</span>
                              <input
                                type="text"
                                value={Array.isArray(field.options) ? field.options.join(', ') : ''}
                                onChange={(e) => handleFieldOptionsChange(key, e.target.value)}
                                disabled={isDefault}
                                placeholder="Opció1, Opció2"
                              />
                              {field.key === 'hozzarendeltSzemely' ? (
                                <span className="muted">
                                  Elo opciok (automatikus): {getMergedOptions(field).join(', ') || 'Nincs'}
                                </span>
                              ) : null}
                            </label>
                          )}
                          {isDefault ? <p className="muted">Alap mező - nem törölhető.</p> : null}
                        </div>
                      )
                    })}
                    {inlineAddGroup === group.title ? (
                      <div className="schema-field-placeholder active">
                        <div className="form-grid">
                          <label className="form-field">
                            <span>Címke</span>
                            <input
                              type="text"
                              value={newField.label}
                              onChange={(e) => setNewField((prev) => ({ ...prev, label: e.target.value }))}
                              ref={keyInputRef}
                              placeholder="Megjelenő név"
                            />
                          </label>
                          <label className="form-field">
                            <span>Típus</span>
                            <select
                              value={newField.type}
                              onChange={(e) => setNewField((prev) => ({ ...prev, type: e.target.value }))}
                            >
                              {FIELD_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          </label>
                          {(newField.type === 'select' || newField.type === 'multiselect') && (
                            <label className="form-field">
                              <span>Opció lista (vesszővel)</span>
                              <input
                                type="text"
                                value={newField.options}
                                onChange={(e) => setNewField((prev) => ({ ...prev, options: e.target.value }))}
                                placeholder="opció1, opció2"
                              />
                            </label>
                          )}
                        </div>
                        <div className="form-actions">
                          <button className="btn" type="button" onClick={() => addField(group.title)} disabled={saving || loading}>
                            <TbPlus /> Hozzáadás
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => {
                              setInlineAddGroup('')
                              setNewField((prev) => ({ ...prev, label: '', options: '' }))
                            }}
                            disabled={saving}
                          >
                            Mégse
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="schema-field-placeholder"
                        type="button"
                        onClick={() => {
                          setStatus('')
                          setLocalError('')
                          setInlineAddGroup(group.title)
                          setNewField((prev) => ({ ...prev, group: group.title }))
                          setTimeout(() => keyInputRef.current?.focus(), 0)
                        }}
                        disabled={saving}
                        title="Új mező ebbe a csoportba"
                      >
                        <TbPlus />
                      </button>
                    )}
                  </div>
                </div>
                {groupIndex < localGroups.length - 1 ? (
                  <div className="group-divider">
                    <div className="divider-line" />
                    <button
                      className="divider-button"
                      type="button"
                      onClick={() => addGroupAt(groupIndex + 1)}
                      title="Új csoport beszúrása"
                    >
                      <TbPlus />
                    </button>
                  </div>
                ) : null}
              </React.Fragment>
            ))}
            {!localGroups.length ? (
              <div className="group-divider">
                <div className="divider-line" />
                <button className="divider-button" type="button" onClick={() => addGroupAt(0)}>
                  <TbPlus />
                </button>
              </div>
            ) : null}
          </div>
        </div>


      </section>


    </main>
  )
}

export default ClientSchemaPage
