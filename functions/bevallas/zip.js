const crcTable = (() => {
  let c
  const table = []
  for (let n = 0; n < 256; n += 1) {
    c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0 ^ -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

function dateToDos(date = new Date()) {
  const year = date.getFullYear() - 1980
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)
  const dosDate = (year << 9) | (month << 5) | day
  const dosTime = (hours << 11) | (minutes << 5) | seconds
  return { dosDate, dosTime }
}

// Build a minimal ZIP (store mode, no compression).
function buildZip(files) {
  const fileHeaders = []
  const centralHeaders = []
  let offset = 0
  const now = dateToDos()

  files.forEach(({ name, content }) => {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const crc = crc32(data)
    const nameBuf = Buffer.from(name, 'utf8')
    const localHeader = Buffer.alloc(30 + nameBuf.length)
    let p = 0
    localHeader.writeUInt32LE(0x04034b50, p); p += 4
    localHeader.writeUInt16LE(20, p); p += 2 // version needed
    localHeader.writeUInt16LE(0, p); p += 2 // flags
    localHeader.writeUInt16LE(0, p); p += 2 // compression: store
    localHeader.writeUInt16LE(now.dosTime, p); p += 2
    localHeader.writeUInt16LE(now.dosDate, p); p += 2
    localHeader.writeUInt32LE(crc, p); p += 4
    localHeader.writeUInt32LE(data.length, p); p += 4
    localHeader.writeUInt32LE(data.length, p); p += 4
    localHeader.writeUInt16LE(nameBuf.length, p); p += 2
    localHeader.writeUInt16LE(0, p); p += 2 // extra length
    nameBuf.copy(localHeader, p)

    fileHeaders.push(localHeader, data)

    const central = Buffer.alloc(46 + nameBuf.length)
    p = 0
    central.writeUInt32LE(0x02014b50, p); p += 4
    central.writeUInt16LE(20, p); p += 2 // version made by
    central.writeUInt16LE(20, p); p += 2 // version needed
    central.writeUInt16LE(0, p); p += 2 // flags
    central.writeUInt16LE(0, p); p += 2 // compression
    central.writeUInt16LE(now.dosTime, p); p += 2
    central.writeUInt16LE(now.dosDate, p); p += 2
    central.writeUInt32LE(crc, p); p += 4
    central.writeUInt32LE(data.length, p); p += 4
    central.writeUInt32LE(data.length, p); p += 4
    central.writeUInt16LE(nameBuf.length, p); p += 2
    central.writeUInt16LE(0, p); p += 2 // extra
    central.writeUInt16LE(0, p); p += 2 // comment
    central.writeUInt16LE(0, p); p += 2 // disk start
    central.writeUInt16LE(0, p); p += 2 // internal attrs
    central.writeUInt32LE(0, p); p += 4 // external attrs
    central.writeUInt32LE(offset, p); p += 4
    nameBuf.copy(central, p)

    centralHeaders.push(central)
    offset += localHeader.length + data.length
  })

  const centralSize = centralHeaders.reduce((sum, buf) => sum + buf.length, 0)
  const eocd = Buffer.alloc(22)
  let ep = 0
  eocd.writeUInt32LE(0x06054b50, ep); ep += 4
  eocd.writeUInt16LE(0, ep); ep += 2 // disk
  eocd.writeUInt16LE(0, ep); ep += 2 // start disk
  eocd.writeUInt16LE(files.length, ep); ep += 2
  eocd.writeUInt16LE(files.length, ep); ep += 2
  eocd.writeUInt32LE(centralSize, ep); ep += 4
  eocd.writeUInt32LE(offset, ep); ep += 4
  eocd.writeUInt16LE(0, ep); ep += 2 // comment len

  return Buffer.concat([...fileHeaders, ...centralHeaders, eocd])
}

module.exports = { buildZip }
