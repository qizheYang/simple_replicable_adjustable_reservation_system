export function todayPST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export function isMobile(): boolean {
  return window.innerWidth <= 768;
}
