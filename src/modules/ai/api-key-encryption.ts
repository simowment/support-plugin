import { MedusaError } from '@medusajs/framework/utils'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createSecretKey,
  randomBytes,
  type KeyObject,
} from 'crypto'
import { SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY } from './constants'

const ENCRYPTED_SECRET_PREFIX = 'enc:v1'
const ENCRYPTED_SECRET_SEPARATOR = ':'
const ENCRYPTED_SECRET_PARTS = 5
const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const ENCRYPTION_AUTH_TAG_BYTES = 16
const ENCRYPTION_IV_BYTES = 12
const ENCRYPTION_KEY_HASH_ALGORITHM = 'sha256'
const SECRET_TEXT_ENCODING = 'utf8'
const SECRET_VALUE_ENCODING = 'base64'
const MISSING_STORE_SECRET_MESSAGE = `${SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY} is required before storing support ticket AI API keys in the database.`
const MISSING_READ_SECRET_MESSAGE = `${SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY} is required to read persisted support ticket AI settings.`
export const INVALID_ENCRYPTED_SECRET_MESSAGE =
  'Persisted support ticket AI API key is not a valid encrypted secret.'

type EncryptionPurpose = 'read' | 'store'

function resolveEncryptionKey(purpose: EncryptionPurpose): KeyObject {
  const secret = process.env[SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY]?.trim()

  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      purpose === 'store' ? MISSING_STORE_SECRET_MESSAGE : MISSING_READ_SECRET_MESSAGE,
    )
  }

  return createSecretKey(
    Uint8Array.from(createHash(ENCRYPTION_KEY_HASH_ALGORITHM).update(secret).digest()),
  )
}

function assertEncryptedSecretParts(parts: string[]): void {
  if (parts.length !== ENCRYPTED_SECRET_PARTS || parts.some((part) => !part)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, INVALID_ENCRYPTED_SECRET_MESSAGE)
  }
}

export function encryptApiKey(apiKey: string): string {
  const key = resolveEncryptionKey('store')
  const iv = randomBytes(ENCRYPTION_IV_BYTES)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, Uint8Array.from(iv), {
    authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
  })
  const encrypted =
    cipher.update(apiKey, SECRET_TEXT_ENCODING, SECRET_VALUE_ENCODING) +
    cipher.final(SECRET_VALUE_ENCODING)
  const tag = cipher.getAuthTag()

  return [
    ENCRYPTED_SECRET_PREFIX,
    iv.toString(SECRET_VALUE_ENCODING),
    tag.toString(SECRET_VALUE_ENCODING),
    encrypted,
  ].join(ENCRYPTED_SECRET_SEPARATOR)
}

export function decryptApiKey(storedValue?: string | null): string | undefined {
  if (storedValue === undefined || storedValue === null) return undefined
  if (!storedValue.startsWith(`${ENCRYPTED_SECRET_PREFIX}${ENCRYPTED_SECRET_SEPARATOR}`)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, INVALID_ENCRYPTED_SECRET_MESSAGE)
  }

  const key = resolveEncryptionKey('read')
  const parts = storedValue.split(ENCRYPTED_SECRET_SEPARATOR)
  assertEncryptedSecretParts(parts)

  const [, , ivValue, tagValue, encryptedValue] = parts
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Uint8Array.from(Buffer.from(ivValue, SECRET_VALUE_ENCODING)),
    {
      authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
    },
  )
  decipher.setAuthTag(Uint8Array.from(Buffer.from(tagValue, SECRET_VALUE_ENCODING)))

  try {
    return (
      decipher.update(encryptedValue, SECRET_VALUE_ENCODING, SECRET_TEXT_ENCODING) +
      decipher.final(SECRET_TEXT_ENCODING)
    )
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, INVALID_ENCRYPTED_SECRET_MESSAGE)
  }
}

export function isInvalidEncryptedApiKeyError(error: unknown): boolean {
  return error instanceof Error && error.message === INVALID_ENCRYPTED_SECRET_MESSAGE
}
