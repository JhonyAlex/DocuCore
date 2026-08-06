import { useState, useEffect, useCallback } from 'react'

export function useTheme() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [isDark])

  const toggle = useCallback(() => setIsDark((prev) => !prev), [])

  return { isDark, toggle }
}
