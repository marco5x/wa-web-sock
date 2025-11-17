export function formatPhoneNumber(input) {
  if (!input) return '';
  return String(input).replace(/[^0-9]/g, '');
}
