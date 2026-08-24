import { NativeModules } from 'react-native'

const { CryptoModule } = NativeModules

enum KEY_PREFIX {
  publicKeyStart = '-----BEGIN PUBLIC KEY-----',
  publicKeyEnd = '-----END PUBLIC KEY-----',
  privateKeyStart = '-----BEGIN PRIVATE KEY-----',
  privateKeyEnd = '-----END PRIVATE KEY-----',
}

export enum RSA_PADDING {
  OAEPWithSHA1AndMGF1Padding = 'RSA/ECB/OAEPWithSHA1AndMGF1Padding', NoPadding = 'RSA/ECB/NoPadding',
}

export enum AES_MODE {
  CBC_128_PKCS7Padding = 'AES/CBC/PKCS7Padding', ECB_128_NoPadding = 'AES',
}

export const generateRsaKey = async() => {
  if (!CryptoModule?.generateRsaKey) throw new Error('CryptoModule not available')
  const key = await CryptoModule.generateRsaKey() as { publicKey: string, privateKey: string }
  return {
    publicKey: `${KEY_PREFIX.publicKeyStart}\n${key.publicKey}${KEY_PREFIX.publicKeyEnd}`,
    privateKey: `${KEY_PREFIX.privateKeyStart}\n${key.privateKey}${KEY_PREFIX.privateKeyEnd}`,
  }
}

export const rsaEncrypt = async(text: string, key: string, padding: RSA_PADDING): Promise<string> => {
  if (!CryptoModule?.rsaEncrypt) throw new Error('CryptoModule not available')
  return CryptoModule.rsaEncrypt(text, key
    .replace(KEY_PREFIX.publicKeyStart, '')
    .replace(KEY_PREFIX.publicKeyEnd, ''), padding)
}

export const rsaDecrypt = async(text: string, key: string, padding: RSA_PADDING): Promise<string> => {
  if (!CryptoModule?.rsaDecrypt) throw new Error('CryptoModule not available')
  return CryptoModule.rsaDecrypt(text, key
    .replace(KEY_PREFIX.privateKeyStart, '')
    .replace(KEY_PREFIX.privateKeyEnd, ''), padding)
}

export const rsaEncryptSync = (text: string, key: string, padding: RSA_PADDING): string => {
  if (!CryptoModule?.rsaEncryptSync) throw new Error('CryptoModule not available')
  return CryptoModule.rsaEncryptSync(text, key
    .replace(KEY_PREFIX.publicKeyStart, '')
    .replace(KEY_PREFIX.publicKeyEnd, ''), padding)
}

export const rsaDecryptSync = (text: string, key: string, padding: RSA_PADDING): string => {
  if (!CryptoModule?.rsaDecryptSync) throw new Error('CryptoModule not available')
  return CryptoModule.rsaDecryptSync(text, key
    .replace(KEY_PREFIX.privateKeyStart, '')
    .replace(KEY_PREFIX.privateKeyEnd, ''), padding)
}

export const aesEncrypt = async(text: string, key: string, vi: string, mode: AES_MODE): Promise<string> => {
  if (!CryptoModule?.aesEncrypt) throw new Error('CryptoModule not available')
  return CryptoModule.aesEncrypt(text, key, vi, mode)
}

export const aesDecrypt = async(text: string, key: string, vi: string, mode: AES_MODE): Promise<string> => {
  if (!CryptoModule?.aesDecrypt) throw new Error('CryptoModule not available')
  return CryptoModule.aesDecrypt(text, key, vi, mode)
}

export const aesEncryptSync = (text: string, key: string, vi: string, mode: AES_MODE): string => {
  if (!CryptoModule?.aesEncryptSync) throw new Error('CryptoModule not available')
  return CryptoModule.aesEncryptSync(text, key, vi, mode)
}

export const aesDecryptSync = (text: string, key: string, vi: string, mode: AES_MODE): string => {
  if (!CryptoModule?.aesDecryptSync) throw new Error('CryptoModule not available')
  return CryptoModule.aesDecryptSync(text, key, vi, mode)
}

export const hashSHA1 = async(text: any) => {
  if (!CryptoModule?.sha1) throw new Error('CryptoModule not available')
  try {
    return await CryptoModule.sha1(text)
  } catch (error) {
    console.error('生成SHA1出现问题:', error)
    throw error
  }
}
