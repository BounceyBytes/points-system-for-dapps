import { z } from 'zod';

/**
 * EVM address validation
 * Format: 0x followed by 40 hexadecimal characters (case-insensitive)
 */
export const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address format')
  .transform((addr) => addr.toLowerCase());

/**
 * Validate EVM address
 */
export function isValidEvmAddress(address: string): boolean {
  return evmAddressSchema.safeParse(address).success;
}

/**
 * Normalize EVM address to lowercase
 */
export function normalizeAddress(address: string): string {
  const result = evmAddressSchema.safeParse(address);
  if (!result.success) {
    throw new Error(`Invalid address: ${address}`);
  }
  return result.data;
}

/**
 * Decimal validation (positive, up to 38 digits, 18 decimals)
 */
export const decimalSchema = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, 'Invalid decimal format')
  .refine(
    (val) => {
      const [whole] = val.split('.');
      return whole.length <= 20; // Max 20 digits before decimal (38 - 18)
    },
    { message: 'Decimal too large' }
  );

/**
 * Product type validation
 */
export const productTypeSchema = z.enum(['LP', 'LST', 'Vault']);

/**
 * Asset validation (alphanumeric, dash, underscore)
 */
export const assetSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9\-_]+$/, 'Invalid asset format');

/**
 * UUID validation
 */
export const uuidSchema = z.string().uuid();

/**
 * Season number validation (positive integer)
 */
export const seasonNumberSchema = z.number().int().positive();

/**
 * Timestamp validation
 */
export const timestampSchema = z.coerce.date();
