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
import TextField from '@mui/material/TextField'

interface Props {
  category: Category | null
  isSaving: boolean
  onCancel: () => void
  onConfirm: (name: string, color: string) => void
}

export function EditCategoryDialog({ category, isSaving, onCancel, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('')

  useEffect(() => {
    setName(category?.name ?? '')
    setColor(category?.color ?? '')
  }, [category])

  return (
    <Dialog open={category !== null} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Edit category</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
          />
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Color (optional)
            </Typography>
            <ColorPicker value={color} onChange={setColor} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">Cancel</Button>
        <LoadingButton
          variant="contained"
          onClick={() => onConfirm(name, color)}
          disabled={!name.trim()}
          loading={isSaving}
        >
          Save
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
