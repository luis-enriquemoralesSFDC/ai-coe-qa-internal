export interface AuthUser {
  id: number
  name: string
  email: string
  is_admin?: boolean
}

// Simple store using localStorage + React state
export function getStoredAuth(): { user: AuthUser | null; token: string | null } {
  try {
    return {
      user: JSON.parse(localStorage.getItem('user') || 'null'),
      token: localStorage.getItem('token'),
    }
  } catch {
    return { user: null, token: null }
  }
}

export function storeAuth(user: AuthUser, token: string) {
  localStorage.setItem('user', JSON.stringify(user))
  localStorage.setItem('token', token)
}

export function clearAuth() {
  localStorage.removeItem('user')
  localStorage.removeItem('token')
}
