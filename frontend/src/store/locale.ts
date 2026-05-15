export type Locale = 'es' | 'en' | 'pt'

export const LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'pt', label: 'Português', flag: '🇧🇷' },
]

export function getStoredLocale(): Locale {
  return (localStorage.getItem('locale') as Locale) ?? 'es'
}

export function storeLocale(locale: Locale) {
  localStorage.setItem('locale', locale)
}
