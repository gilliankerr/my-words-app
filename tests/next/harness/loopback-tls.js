// Ephemeral, self-signed test certificate. No files, system trust changes or secrets.
const { generateKeyPairSync, randomBytes, sign } = require('node:crypto');
function loopbackTLS() {
  const der = (tag, ...values) => {
    const body = Buffer.concat(values.map(value => Buffer.isBuffer(value) ? value : Buffer.from(value)));
    const length = body.length < 128 ? Buffer.from([body.length]) : (() => { const bytes = []; for (let n = body.length; n; n >>= 8) bytes.unshift(n & 255); return Buffer.from([128 | bytes.length, ...bytes]); })();
    return Buffer.concat([Buffer.from([tag]), length, body]);
  };
  const seq = (...values) => der(0x30, ...values);
  const integer = bytes => der(2, bytes);
  const oid = hex => der(6, Buffer.from(hex, 'hex'));
  const algorithm = seq(oid('2a864886f70d01010b'), der(5));
  const name = seq(der(0x31, seq(oid('550403'), der(0x0c, 'localhost'))));
  const utc = date => der(0x17, date.toISOString().replace(/\D/g, '').slice(2, 14) + 'Z');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const san = seq(oid('551d11'), der(4, seq(der(0x87, Buffer.from([127, 0, 0, 1])), der(0x82, 'localhost'))));
  const tbs = seq(der(0xa0, integer([2])), integer(Buffer.concat([Buffer.from([1]), randomBytes(16)])), algorithm, name,
    seq(utc(new Date(Date.now() - 86400000)), utc(new Date(Date.now() + 86400000))), name,
    publicKey.export({ type: 'spki', format: 'der' }), der(0xa3, seq(san)));
  const certificate = seq(tbs, algorithm, der(3, Buffer.from([0]), sign('sha256', tbs, privateKey)));
  const cert = '-----BEGIN CERTIFICATE-----\n' + certificate.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----';
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert };
}
module.exports = { loopbackTLS };
