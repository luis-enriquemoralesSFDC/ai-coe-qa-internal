/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Salesforce Lightning Design System tokens
        slds: {
          // Neutrals
          'neutral-1':  '#ffffff',
          'neutral-2':  '#f3f3f3',
          'neutral-3':  '#e5e5e5',
          'neutral-4':  '#dddbda',
          'neutral-5':  '#c9c7c5',
          'neutral-6':  '#b0adab',
          'neutral-7':  '#706e6b',
          'neutral-8':  '#514f4d',
          'neutral-9':  '#3e3e3c',
          'neutral-10': '#181818',
          // Brand — azul Salesforce (paleta canónica del design system).
          'brand':       '#0176d3',
          'brand-dark':  '#014486',
          'brand-light': '#d8edff',
          // AI accent — violet para acciones de IA específicamente (Generar, INVEST, Coach).
          // Diferenciable del brand azul para semántica clara: azul = acción normal, violet = acción IA.
          'ai':          '#7c3aed',
          'ai-dark':     '#6d28d9',
          'ai-light':    '#f5f3ff',
          // Topbar — blanco minimalista (estilo Linear/Notion). Topbar-item ahora es color sobre fondo claro.
          'topbar':      '#ffffff',
          'topbar-item': '#52525b',
          // Success / Error / Warning
          'success':     '#2e844a',
          'success-bg':  '#eaf5e9',
          'error':       '#ba0517',
          'error-bg':    '#fef1ee',
          'warning':     '#dd7a01',
          'warning-bg':  '#fef6e1',
          // Sidebar
          'sidebar-bg':  '#ffffff',
          'sidebar-w':   '220px',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Salesforce Sans"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'slds': '0.75rem',  // 12px — bordes modernos tipo Linear/Vercel; reemplaza el 4px legacy SLDS
      },
      boxShadow: {
        // Doble capa: una difusa para profundidad, otra definida para borde — técnica Tailwind UI / Linear / Stripe
        'slds-card': '0 1px 3px 0 rgba(0,0,0,0.05), 0 1px 2px 0 rgba(0,0,0,0.03)',
        'slds-drop': '0 10px 25px -5px rgba(0,0,0,0.10), 0 8px 10px -6px rgba(0,0,0,0.05)',
        'slds-focus': '0 0 3px 0 #0176d3',
      },
    },
  },
  plugins: [],
}
