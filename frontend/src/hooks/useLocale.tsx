import React, { createContext, useContext, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { type Locale, getStoredLocale, storeLocale } from '../store/locale'

interface LocaleContextValue {
  locale: Locale
  changeLocale: (l: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getStoredLocale)
  const { i18n } = useTranslation()

  const changeLocale = useCallback(
    (l: Locale) => {
      storeLocale(l)
      setLocale(l)
      i18n.changeLanguage(l)
    },
    [i18n],
  )

  return (
    <LocaleContext.Provider value={{ locale, changeLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used inside LanguageProvider')
  return ctx
}
