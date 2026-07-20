'use client'

import { useState, useEffect } from 'react'
import type { Category } from '@/gen/wellspent/v1/budget_pb'
import { ColorPicker } from '@/components/ui/ColorPicker'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'

interface Props {
  category: Category | null
  isSaving: boolean
  onCancel: () => void
  onConfirm: (color: string) => void
}

export function SystemColorDialog({ category, isSaving, onCancel, onConfirm }: Props) {
  const [color, setColor] = useState('')

  useEffect(() => {
    setColor(category?.color ?? '')
  }, [category])

  return (
    <Dialog open={category !== null} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Set color — {category?.name}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            Color (optional)
          </Typography>
          <ColorPicker value={color} onChange={setColor} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">Cancel</Button>
        <LoadingButton variant="contained" onClick={() => onConfirm(color)} loading={isSaving}>
          Save
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
