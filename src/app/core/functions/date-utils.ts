/**
 * Utility functions for safe date handling without timezone issues
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