
function compressPubKey(pubKey) {
  const x = pubKey.substring(2, 66)
  const y = pubKey.substring(66, 130)
  let prefix
  const even = parseInt(y.substring(62, 64), 16) % 2 === 0
  even ? prefix = '02' : prefix = '03'
  return prefix + x
}

function padHexStart (hex, length) {
  let len = length || hex.length
  len += len % 2

  return hex.padStart(len, '0')
}

function getAmountBuffer (amount) {
  let hexAmount = Math.round(amount).toString(16)
  hexAmount = padHexStart(hexAmount, 16)
  const valueBuffer = Buffer.from(hexAmount, 'hex')
  return valueBuffer.reverse()
}

export { compressPubKey, getAmountBuffer }