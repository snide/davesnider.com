// Timezone used to bucket activity into calendar days (the user's local time).
// Used when grouping Plex episodes watched on the "same day" so that an evening
// watch is not pushed into the next UTC day.
export const USER_TIMEZONE = 'America/New_York';

/** Formats a Date as a YYYY-MM-DD string in the user's local timezone. */
export function formatUserDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: USER_TIMEZONE });
}
