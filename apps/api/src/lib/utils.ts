import { clsx, type ClassValue } from 'clsx'

/** Lightweight cn without Tailwind (API has no UI). */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
