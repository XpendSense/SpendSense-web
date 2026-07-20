'use client'

import Button, { type ButtonProps } from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
}

// Thin wrapper around MUI's Button that swaps in a spinner while an action
// is pending, instead of relying on `disabled` alone — a disabled button
// looks identical to an enabled one at a glance, which is why a slow first
// load or mutation invites a second or third click.
export function LoadingButton({ loading = false, disabled, startIcon, children, ...props }: LoadingButtonProps) {
  return (
    <Button
      {...props}
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : startIcon}
    >
      {children}
    </Button>
  )
}
