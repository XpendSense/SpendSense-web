'use client'

import { useState, createContext, useContext, useCallback } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { formatError } from '@/lib/errors'

interface SnackbarContextValue {
  showError: (err: unknown) => void
  showSuccess: (message: string) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; message: string; severity: 'error' | 'success' }>({
    open: false,
    message: '',
    severity: 'error',
  })

  const showError = useCallback((err: unknown) => {
    setState({ open: true, message: formatError(err), severity: 'error' })
  }, [])

  const showSuccess = useCallback((message: string) => {
    setState({ open: true, message, severity: 'success' })
  }, [])

  return (
    <SnackbarContext.Provider value={{ showError, showSuccess }}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={5000}
        onClose={() => setState((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={state.severity} onClose={() => setState((s) => ({ ...s, open: false }))}>
          {state.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  )
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext)
  if (!ctx) throw new Error('useSnackbar must be used inside SnackbarProvider')
  return ctx
}
