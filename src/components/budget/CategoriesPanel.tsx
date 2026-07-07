'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { Category } from '@/gen/spendsense/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { COLORS, COLOR_NAMES } from '@/lib/config/colors'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PaletteIcon from '@mui/icons-material/Palette'
import ShuffleIcon from '@mui/icons-material/Shuffle'

function ColorDot({ color }: { color: string }) {
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        bgcolor: color || 'text.disabled',
        border: '1px solid',
        borderColor: color ? 'transparent' : 'divider',
        flexShrink: 0,
        mr: 1,
      }}
    />
  )
}

export function CategoriesPanel() {
  const { showError, showSuccess } = useSnackbar()
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('')

  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const [editingSystemCat, setEditingSystemCat] = useState<Category | null>(null)
  const [systemEditColor, setSystemEditColor] = useState('')

  const [deletingCat, setDeletingCat] = useState<Category | null>(null)
  const [replacementId, setReplacementId] = useState<number>(0)
  const [isRandomizing, setIsRandomizing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => client.listCategories({}),
  })

  const { mutateAsync: doCreate, isPending: isCreating } = useMutation({
    mutationFn: (vars: { name: string; color: string }) => client.createCategory(vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const { mutateAsync: doUpdate, isPending: isUpdating } = useMutation({
    mutationFn: (vars: { id: number; name: string; color: string }) => client.updateCategory(vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const { mutateAsync: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: (vars: { id: number; replacementId: number }) => client.deleteCategory(vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      await doCreate({ name: newName.trim(), color: newColor })
      logger.info('category.create', { name: newName })
      showSuccess(`Category "${newName}" created`)
      setNewName('')
      setNewColor('')
    } catch (err) {
      showError(err)
    }
  }

  function openEdit(cat: Category) {
    setEditingCat(cat)
    setEditName(cat.name)
    setEditColor(cat.color)
  }

  async function handleUpdate() {
    if (!editingCat || !editName.trim()) return
    try {
      await doUpdate({ id: editingCat.id, name: editName.trim(), color: editColor })
      logger.info('category.update', { id: editingCat.id, name: editName })
      showSuccess(`Category updated`)
      setEditingCat(null)
    } catch (err) {
      showError(err)
    }
  }

  function openSystemColorEdit(cat: Category) {
    setEditingSystemCat(cat)
    setSystemEditColor(cat.color)
  }

  async function handleSystemColorUpdate() {
    if (!editingSystemCat) return
    try {
      await doUpdate({ id: editingSystemCat.id, name: editingSystemCat.name, color: systemEditColor })
      logger.info('category.color', { id: editingSystemCat.id, color: systemEditColor })
      showSuccess(`Color updated`)
      setEditingSystemCat(null)
    } catch (err) {
      showError(err)
    }
  }

  async function handleRandomizeSystemColors() {
    setIsRandomizing(true)
    try {
      const pool = [...COLOR_NAMES]
      const picks: string[] = systemCats.map((_, i) => {
        if (pool.length === 0) pool.push(...COLOR_NAMES)
        const idx = Math.floor(Math.random() * pool.length)
        return COLORS[pool.splice(idx, 1)[0]]
      })
      await Promise.all(systemCats.map((cat, i) => doUpdate({ id: cat.id, name: cat.name, color: picks[i] })))
      logger.info('category.randomize_colors', { count: systemCats.length })
    } catch (err) {
      showError(err)
    } finally {
      setIsRandomizing(false)
    }
  }

  function openDelete(cat: Category) {
    setDeletingCat(cat)
    setReplacementId(0)
  }

  async function handleDelete() {
    if (!deletingCat || replacementId === 0) return
    try {
      await doDelete({ id: deletingCat.id, replacementId })
      logger.info('category.delete', { id: deletingCat.id, replacementId })
      showSuccess(`"${deletingCat.name}" deleted`)
      setDeletingCat(null)
    } catch (err) {
      showError(err)
    }
  }

  const categories = data?.categories ?? []
  const systemCats = categories.filter((c) => c.isSystem)
  const userCats = categories.filter((c) => !c.isSystem)
  const replacementOptions = categories.filter((c) => c.id !== deletingCat?.id)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* System categories */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>System categories</Typography>
          <Tooltip title="Assign random colors to all">
            <span>
              <IconButton size="small" onClick={handleRandomizeSystemColors} disabled={isRandomizing || systemCats.length === 0}>
                <ShuffleIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        {isLoading ? (
          <CircularProgress size={20} />
        ) : systemCats.length === 0 ? (
          <Typography variant="body2" color="text.secondary">None.</Typography>
        ) : (
          <List dense disablePadding>
            {systemCats.map((c) => (
              <ListItem
                key={c.id}
                disableGutters
                secondaryAction={
                  <IconButton size="small" onClick={() => openSystemColorEdit(c)} aria-label="set color">
                    <PaletteIcon fontSize="small" sx={c.color ? { color: c.color } : {}} />
                  </IconButton>
                }
              >
                <ColorDot color={c.color} />
                <ListItemText primary={c.name} />
                <Chip label="System" size="small" variant="outlined" sx={{ ml: 1, mr: 4 }} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Divider />

      {/* User categories */}
      <Box>
        <Typography variant="subtitle1" fontWeight={600} mb={1}>Your categories</Typography>
        {isLoading ? (
          <CircularProgress size={20} />
        ) : userCats.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No custom categories yet.</Typography>
        ) : (
          <List dense disablePadding>
            {userCats.map((c) => (
              <ListItem
                key={c.id}
                disableGutters
                secondaryAction={
                  <Box>
                    <IconButton size="small" onClick={() => openEdit(c)} aria-label="edit">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => openDelete(c)} aria-label="delete">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ColorDot color={c.color} />
                <ListItemText primary={c.name} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Divider />

      {/* Add category */}
      <Box>
        <Typography variant="subtitle1" fontWeight={600} mb={1}>Add a category</Typography>
        <Stack spacing={2}>
          <TextField
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            size="small"
            fullWidth
            placeholder="e.g. Dining"
          />
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Color (optional)
            </Typography>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </Box>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!newName.trim() || isCreating}
          >
            {isCreating ? 'Creating…' : 'Create'}
          </Button>
        </Stack>
      </Box>

      {/* System category color dialog */}
      <Dialog open={editingSystemCat !== null} onClose={() => setEditingSystemCat(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Set color — {editingSystemCat?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Color (optional)
            </Typography>
            <ColorPicker value={systemEditColor} onChange={setSystemEditColor} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingSystemCat(null)} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={handleSystemColorUpdate} disabled={isUpdating}>
            {isUpdating ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editingCat !== null} onClose={() => setEditingCat(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit category</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              autoFocus
            />
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Color (optional)
              </Typography>
              <ColorPicker value={editColor} onChange={setEditColor} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingCat(null)} color="inherit">Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={!editName.trim() || isUpdating}
          >
            {isUpdating ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deletingCat !== null} onClose={() => setDeletingCat(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete category</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              All transactions in <strong>{deletingCat?.name}</strong> will be moved to the replacement category before it is deleted.
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
          <Button onClick={() => setDeletingCat(null)} color="inherit">Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={replacementId === 0 || isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
