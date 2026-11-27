export const MAX_EMAIL_LENGTH = 254;

/** Trimmed + lowercased: the form invites are stored and matched in. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Deliberately simple: one "@", no spaces, a dot in the domain. The real check is delivery.
export const isValidEmail = (email: string) =>
  email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
