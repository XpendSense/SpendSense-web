'use client'

import { useState, useEffect } from 'react'
import type { Category } from '@/gen/wellspent/v1/budget_pb'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'

interface Props {
  category: Category | null
  replacementOptions: Category[]
  isDeleting: boolean
  onCancel: () => void
  onConfirm: (replacementId: number) => void
}

export function DeleteCategoryDialog({ category, replacementOptions, isDeleting, onCancel, onConfirm }: Props) {
  const [replacementId, setReplacementId] = useState(0)

  useEffect(() => {
    setReplacementId(0)
  }, [category])

  return (
    <Dialog open={category !== null} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Delete category</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            All transactions in <strong>{category?.name}</strong> will be moved to the replacement category before it is deleted.
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>Replacement category</InputLabel>
            <Select
              label="Replacement category"
              value={replacementId === 0 ? '' : replacementId}
              onChange={(e) => setReplacementId(Number(e.target.value))}
            >
              {replacementOptions.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}{c.isSystem ? ' (System)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">Cancel</Button>
        <LoadingButton
          variant="contained"
          color="error"
          onClick={() => onConfirm(replacementId)}
          disabled={replacementId === 0}
          loading={isDeleting}
        >
          Delete
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
