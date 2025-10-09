/**
 * Utility functions for safe date handling without timezone issues
 *
 * IMPORTANT: These functions are designed for Mexico timezone (UTC-6/UTC-5)
 * and prevent timezone-related bugs that cause dates to shift by one day.
 */

/**
 * Safely parse a date string (YYYY-MM-DD) as local date
 * Avoids timezone issues that cause dates to shift by one day
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();

  // Parse the date string manually to avoid UTC interpretation
  const [year, month, day] = dateString.split('-').map(Number);

  // Create date in local timezone (month is 0-indexed in JavaScript)
  return new Date(year, month - 1, day);
}

/**
 * Convert a Date object to YYYY-MM-DD string in LOCAL timezone
 *
 * ⚠️ CRITICAL: This function prevents the timezone bug where dates shift
 * when converted to UTC. Always use this instead of .toISOString().split('T')[0]
 *
 * Example problem:
 * - Date: Oct 8, 2025 19:00 (Mexico time UTC-6)
 * - Using .toISOString(): "2025-10-09" ❌ WRONG (converts to UTC, becomes Oct 9)
 * - Using this function: "2025-10-08" ✅ CORRECT (uses local date)
 *
 * @param date - The Date object to convert
 * @returns String in YYYY-MM-DD format using local timezone
 */
export function formatDateToLocalYYYYMMDD(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.warn('Invalid date passed to formatDateToLocalYYYYMMDD:', date);
    return new Date().toLocaleDateString('en-CA'); // Fallback to today
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in YYYY-MM-DD format (LOCAL timezone)
 *
 * ⚠️ CRITICAL: Use this instead of new Date().toISOString().split('T')[0]
 * to prevent timezone bugs in Mexico (UTC-6).
 *
 * @returns Today's date string in YYYY-MM-DD format
 */
export function getTodayLocalYYYYMMDD(): string {
  return formatDateToLocalYYYYMMDD(new Date());
}

/**
 * Format a date string (YYYY-MM-DD) for display in Mexican format
 * Safe against timezone issues
 */
export function formatDateForDisplay(dateString: string): string {
  if (!dateString) return '';

  const localDate = parseLocalDate(dateString);
  return localDate.toLocaleDateString('es-MX');
}

/**
 * Format a date string (YYYY-MM-DD) for display in a specific format
 */
export function formatDateCustom(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return '';

  const localDate = parseLocalDate(dateString);
  return localDate.toLocaleDateString('es-MX', options);
}