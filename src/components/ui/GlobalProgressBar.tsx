'use client'

import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import LinearProgress from '@mui/material/LinearProgress'

// Thin animated bar fixed to the top of the viewport whenever any query or
// mutation is in flight, anywhere in the app. A single signal that "this is
// loading" for tab switches, page loads, and button clicks alike, with no
// per-component wiring needed. The 150ms fade-in delay avoids a flash for
// requests that resolve near-instantly; fade-out is immediate.
export function GlobalProgressBar() {
  const isFetching = useIsFetching()
  const isMutating = useIsMutating()
  const active = isFetching > 0 || isMutating > 0

  return (
    <Fade in={active} style={{ transitionDelay: active ? '150ms' : '0ms' }} unmountOnExit>
      <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: (theme) => theme.zIndex.tooltip + 1 }}>
        <LinearProgress />
      </Box>
    </Fade>
  )
}
