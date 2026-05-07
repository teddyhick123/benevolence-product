/**
 * AI Input Validators
 *
 * Validation utilities for AI tool inputs.
 * Ensures data integrity and prevents injection attacks.
 */

/**
 * Custom validation error for AI inputs
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Input validator with type-safe validation methods
 */
export const InputValidator = {
  /**
   * Validate UUID format
   */
  validateUUID(value: string, fieldName: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid UUID`);
    }
  },

  /**
   * Validate number with optional min/max bounds
   */
  validateNumber(value: any, fieldName: string, options?: { min?: number; max?: number }): void {
    if (value === undefined || value === null) return;
    const num = Number(value);
    if (isNaN(num)) {
      throw new ValidationError(`${fieldName} must be a valid number`);
    }
    if (options?.min !== undefined && num < options.min) {
      throw new ValidationError(`${fieldName} must be at least ${options.min}`);
    }
    if (options?.max !== undefined && num > options.max) {
      throw new ValidationError(`${fieldName} must be at most ${options.max}`);
    }
  },

  /**
   * Validate string with optional length and pattern constraints
   */
  validateString(value: any, fieldName: string, options?: { maxLength?: number; pattern?: RegExp }): void {
    if (value === undefined || value === null) return;
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`);
    }
    if (options?.maxLength && value.length > options.maxLength) {
      throw new ValidationError(`${fieldName} must be at most ${options.maxLength} characters`);
    }
    if (options?.pattern && !options.pattern.test(value)) {
      throw new ValidationError(`${fieldName} has invalid format`);
    }
  },

  /**
   * Validate enum value
   */
  validateEnum<T>(value: any, fieldName: string, allowedValues: readonly T[]): void {
    if (value === undefined || value === null) return;
    if (!allowedValues.includes(value as T)) {
      throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }
  },

  /**
   * Validate date string format
   */
  validateDateString(value: any, fieldName: string): void {
    if (value === undefined || value === null) return;
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date string (YYYY-MM-DD)`);
    }
  },

  /**
   * Validate array with optional max length
   */
  validateArray(value: any, fieldName: string, options?: { maxLength?: number }): void {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an array`);
    }
    if (options?.maxLength && value.length > options.maxLength) {
      throw new ValidationError(`${fieldName} must contain at most ${options.maxLength} items`);
    }
  },

  /**
   * Validate required field is present
   */
  validateRequired(value: any, fieldName: string): void {
    if (value === undefined || value === null || value === '') {
      throw new ValidationError(`${fieldName} is required`);
    }
  },

  /**
   * Validate EIN format (XX-XXXXXXX)
   */
  validateEIN(value: any, fieldName: string): void {
    if (value === undefined || value === null) return;
    const einRegex = /^\d{2}-?\d{7}$/;
    if (!einRegex.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid EIN (XX-XXXXXXX)`);
    }
  },

  /**
   * Validate email format
   */
  validateEmail(value: any, fieldName: string): void {
    if (value === undefined || value === null) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid email address`);
    }
  },

  /**
   * Validate currency amount (positive number with max 2 decimals)
   */
  validateCurrency(value: any, fieldName: string): void {
    if (value === undefined || value === null) return;
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      throw new ValidationError(`${fieldName} must be a positive number`);
    }
    // Check max 2 decimal places
    if (Math.round(num * 100) !== num * 100) {
      throw new ValidationError(`${fieldName} must have at most 2 decimal places`);
    }
  },
};
