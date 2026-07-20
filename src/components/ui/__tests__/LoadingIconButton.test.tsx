import { render, screen } from '@testing-library/react'
import DeleteIcon from '@mui/icons-material/Delete'
import { LoadingIconButton } from '../LoadingIconButton'

describe('LoadingIconButton', () => {
  it('renders its icon and is enabled when not loading', () => {
    render(<LoadingIconButton aria-label="delete"><DeleteIcon /></LoadingIconButton>)
    expect(screen.getByRole('button', { name: 'delete' })).not.toBeDisabled()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows a spinner and disables the button while loading', () => {
    render(<LoadingIconButton aria-label="delete" loading><DeleteIcon /></LoadingIconButton>)
    expect(screen.getByRole('button', { name: 'delete' })).toBeDisabled()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('stays disabled when explicitly disabled, independent of loading', () => {
    render(<LoadingIconButton aria-label="delete" disabled><DeleteIcon /></LoadingIconButton>)
    expect(screen.getByRole('button', { name: 'delete' })).toBeDisabled()
  })
})
