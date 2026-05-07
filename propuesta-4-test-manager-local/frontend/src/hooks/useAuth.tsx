import React, { createContext, useContext, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getStoredAuth, storeAuth, clearAuth, type AuthUser } from '../store/auth'

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (user: AuthUser, token: string) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const stored = getStoredAuth()
  const [user, setUser] = useState<AuthUser | null>(stored.user)
  const [token, setToken] = useState<string | null>(stored.token)
  const queryClient = useQueryClient()

  const login = useCallback(
    (u: AuthUser, t: string) => {
      // Limpia cache de React Query antes de meter el nuevo user para evitar
      // que datos del user anterior (proyectos, planes, conversaciones del
      // coach) queden visibles momentáneamente en componentes que ya
      // estaban montados o se montan desde cache.
      queryClient.clear()
      storeAuth(u, t)
      setUser(u)
      setToken(t)
    },
    [queryClient],
  )

  const logout = useCallback(() => {
    // Limpia cache + storage. Esto garantiza que ningún dato confidencial
    // (test plans, mensajes del coach, contenido del wizard) sobreviva al
    // logout en memoria del navegador.
    queryClient.clear()
    clearAuth()
    setUser(null)
    setToken(null)
  }, [queryClient])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
