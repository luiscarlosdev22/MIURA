export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function formatPhone(phone: string): string {
  const n = normalizePhone(phone)
  if (n.length === 13) {
    return `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 9)}-${n.slice(9)}`
  }
  return `+${n}`
}
