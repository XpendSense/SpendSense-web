import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { GlobalProgressBar } from '../GlobalProgressBar'

function Harness({ queryFn }: { queryFn: () => Promise<string> }) {
  useQuery({ queryKey: ['test'], queryFn })
  return <GlobalProgressBar />
}

describe('GlobalProgressBar', () => {
  it('is hidden when nothing is fetching', () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <GlobalProgressBar />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows while a query is in flight and hides once it resolves', async () => {
    const client = new QueryClient()
    let resolve: (v: string) => void = () => {}
    const queryFn = () => new Promise<string>((r) => { resolve = r })

    render(
      <QueryClientProvider client={client}>
        <Harness queryFn={queryFn} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('progressbar')).toBeInTheDocument()

    resolve('done')
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })
})
