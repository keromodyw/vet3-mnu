/** keeps digits only — Arabic-Indic (٠-٩) and Persian (۰-۹) numerals become plain 0-9, so any keyboard works */
export function onlyDigits(v: string, max = Infinity): string {
  return v
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '')
    .slice(0, max)
}
