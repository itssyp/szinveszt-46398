import React from 'react'

function StatusBadge({ ok, message }) {
  return (
    <div className="status" data-ok={String(ok)}>
      {message}
    </div>
  )
}

export default StatusBadge
