'use client'

import IconButton, { type IconButtonProps } from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'

export interface LoadingIconButtonProps extends IconButtonProps {
  loading?: boolean
}

// Icon-button counterpart to LoadingButton — swaps the icon for a spinner
// while pending instead of relying on `disabled` alone.
export function LoadingIconButton({ loading = false, disabled, children, ...props }: LoadingIconButtonProps) {
  return (
    <IconButton {...props} disabled={disabled || loading}>
      {loading ? <CircularProgress size={props.size === 'small' ? 16 : 20} color="inherit" /> : children}
    </IconButton>
  )
}
