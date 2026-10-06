// Text helpers shared by the alert and digest scripts.
import { loadBodies } from './lib.mjs';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-10-20" -> "20 OCT 2026". Regex only, never new Date(iso). */
export function ddMmmYyyy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]} ${MON[+m[2] - 1]} ${m[1]}` : iso ?? '';
}

/** "2026-10-20" -> "Tue 20 OCT" */
export function ddMmm(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const dow = DOW[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${dow} ${m[3]} ${MON[+m[2] - 1]}`;
}

/** "18:20" -> "6:20 PM" */
export function time12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const SITE = 'https://redfearn-group.github.io/civic-log/';
export const siteUrl = (p = '') => SITE + p;

const bodies = new Map(loadBodies({ includeInactive: true }).map((b) => [b.id, b]));
export const shortBody = (n) => bodies.get(n.body)?.short ?? n.bodyLabel;
