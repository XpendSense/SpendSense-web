import { render, screen } from '@testing-library/react'
import { LoadingButton } from '../LoadingButton'

describe('LoadingButton', () => {
  it('renders children and is enabled when not loading', () => {
    render(<LoadingButton>Save</LoadingButton>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).not.toBeDisabled()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows a spinner and disables the button while loading', () => {
    render(<LoadingButton loading>Save</LoadingButton>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('stays disabled when explicitly disabled, independent of loading', () => {
    render(<LoadingButton disabled>Save</LoadingButton>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
