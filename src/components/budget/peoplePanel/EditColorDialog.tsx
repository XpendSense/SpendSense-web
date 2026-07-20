'use client'

import { useState, useEffect } from 'react'
import type { BudgetPerson } from '@/gen/wellspent/v1/budget_pb'
import { ColorPicker } from '@/components/ui/ColorPicker'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'

interface Props {
  person: BudgetPerson | null
  isSaving: boolean
  onCancel: () => void
  onConfirm: (color: string) => void
}

export function EditColorDialog({ person, isSaving, onCancel, onConfirm }: Props) {
  const [color, setColor] = useState('')

  useEffect(() => {
    setColor(person?.color ?? '')
  }, [person])

  return (
    <Dialog open={person !== null} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Color for {person?.userName}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <ColorPicker value={color} onChange={setColor} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">Cancel</Button>
        <LoadingButton
          variant="contained"
          onClick={() => onConfirm(color)}
          loading={isSaving}
        >
          Save
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
