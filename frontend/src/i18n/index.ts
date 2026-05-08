import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es'
import en from './locales/en'
import pt from './locales/pt'
import { getStoredLocale } from '../store/locale'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      pt: { translation: pt },
    },
    lng: getStoredLocale(),
    fallbackLng: 'es',
    interpolation: {
      // React already escapes values — no double-escaping needed
      escapeValue: false,
    },
  })

export default i18n
