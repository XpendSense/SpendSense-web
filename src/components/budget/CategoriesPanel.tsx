'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { Category } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { logger } from '@/lib/logger'
import { generateDistinctColors } from './categoriesPanel/colorUtils'
import { ColorDot } from './categoriesPanel/ColorDot'
import { SystemColorDialog } from './categoriesPanel/SystemColorDialog'
import { EditCategoryDialog } from './categoriesPanel/EditCategoryDialog'
import { DeleteCategoryDialog } from './categoriesPanel/DeleteCategoryDialog'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PaletteIcon from '@mui/icons-material/Palette'
import ShuffleIcon from '@mui/icons-material/Shuffle'

export function CategoriesPanel({ canEdit = true }: { canEdit?: boolean }) {
  const { showError, showSuccess } = useSnackbar()
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('')

  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editingSystemCat, setEditingSystemCat] = useState<Category | null>(null)
  const [deletingCat, setDeletingCat] = useState<Category | null>(null)
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

  async function handleUpdate(name: string, color: string) {
    if (!editingCat || !name.trim()) return
    try {
      await doUpdate({ id: editingCat.id, name: name.trim(), color })
      logger.info('category.update', { id: editingCat.id, name })
      showSuccess(`Category updated`)
      setEditingCat(null)
    } catch (err) {
      showError(err)
    }
  }

  async function handleSystemColorUpdate(color: string) {
    if (!editingSystemCat) return
    try {
      await doUpdate({ id: editingSystemCat.id, name: editingSystemCat.name, color })
      logger.info('category.color', { id: editingSystemCat.id, color })
      showSuccess(`Color updated`)
      setEditingSystemCat(null)
    } catch (err) {
      showError(err)
    }
  }

  async function handleRandomizeSystemColors() {
    setIsRandomizing(true)
    try {
      const picks = generateDistinctColors(systemCats.length)
      await Promise.all(systemCats.map((cat, i) => doUpdate({ id: cat.id, name: cat.name, color: picks[i] })))
      logger.info('category.randomize_colors', { count: systemCats.length })
    } catch (err) {
      showError(err)
    } finally {
      setIsRandomizing(false)
    }
  }

  async function handleDelete(replacementId: number) {
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
          {canEdit && (
            <Tooltip title="Assign random colors to all">
              <span>
                <IconButton size="small" onClick={handleRandomizeSystemColors} disabled={isRandomizing || systemCats.length === 0}>
                  <ShuffleIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
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
                  canEdit ? (
                    <IconButton size="small" onClick={() => setEditingSystemCat(c)} aria-label="set color">
                      <PaletteIcon fontSize="small" sx={c.color ? { color: c.color } : {}} />
                    </IconButton>
                  ) : undefined
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
                  canEdit ? (
                    <Box>
                      <IconButton size="small" onClick={() => setEditingCat(c)} aria-label="edit">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeletingCat(c)} aria-label="delete">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : undefined
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

      {/* Add category — hidden for viewers */}
      {canEdit && (
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
            <LoadingButton
              variant="contained"
              onClick={handleCreate}
              disabled={!newName.trim()}
              loading={isCreating}
            >
              Create
            </LoadingButton>
          </Stack>
        </Box>
      )}

      <SystemColorDialog
        category={editingSystemCat}
        isSaving={isUpdating}
        onCancel={() => setEditingSystemCat(null)}
        onConfirm={handleSystemColorUpdate}
      />

      <EditCategoryDialog
        category={editingCat}
        isSaving={isUpdating}
        onCancel={() => setEditingCat(null)}
        onConfirm={handleUpdate}
      />

      <DeleteCategoryDialog
        category={deletingCat}
        replacementOptions={replacementOptions}
        isDeleting={isDeleting}
        onCancel={() => setDeletingCat(null)}
        onConfirm={handleDelete}
      />
    </Box>
  )
}
