export function toISOString(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

export function fromISOString(isoString: string): Date {
  return new Date(isoString);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function subtractMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60000);
}

export function isExpired(date: Date, ttlMinutes: number): boolean {
  return Date.now() - date.getTime() > ttlMinutes * 60000;
}

export function formatForBrendi(date: Date): string {
  return date.toISOString();
}

export function parseBrendiDate(dateString: string): Date {
  return new Date(dateString);
}

export function now(): Date {
  return new Date();
}

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}