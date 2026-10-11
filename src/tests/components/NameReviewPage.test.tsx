// Admin name review page (/admin/name-review): word menus, quick fixes,
// confirm, and the stale-response guard on list switches.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType, ReactNode } from 'react'
import type { NameReviewItem } from '../../lib/types'

const { getQueue, confirm } = vi.hoisted(() => ({ getQueue: vi.fn(), confirm: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({ options }),
  Link: ({ children, className }: { children: ReactNode; className?: string }) => <a className={className}>{children}</a>,
}))
vi.mock('../../components/AuthProvider', () => ({
  useAuth: () => ({ session: { access_token: 'token-1' } }),
}))
vi.mock('../../components/ProtectedRoute', () => ({
  AdminRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('../../server/functions/nameReview', () => ({
  getNameReviewQueue: getQueue,
  confirmNameParts: confirm,
}))

import { Route } from '../../routes/admin/name-review/index'

const Page = (Route as unknown as { options: { component: ComponentType } }).options.component

const item = (id: string, name: string, overrides: Partial<NameReviewItem> = {}): NameReviewItem => ({
  id,
  name,
  first_name: null,
  middle_name: null,
  last_name: null,
  suffix: null,
  name_parts_status: 'pending',
  is_archived: false,
  membership_status: 'active',
  photo_url: null,
  ...overrides,
})

const counts = { pending: 2, auto: 1, confirmed: 0, total: 3 }
const box = (key: string) => document.getElementById(`part-${key}`) as HTMLInputElement
const menu = (word: string) => screen.getByLabelText(`Part for ${word}`) as HTMLSelectElement
// The member's display name, as shown at the top of the card.
const displayName = () => screen.getByText('Display name').nextElementSibling?.textContent
// The card is ready once the word menus are in (they fill one render after the name).
const ready = (firstWord: string) => screen.findByLabelText(`Part for ${firstWord}`)

describe('Name review page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows one menu per word, defaulting to the guess', async () => {
    getQueue.mockResolvedValue({ items: [item('m1', 'Cindy Sister Bartolome')], counts })
    render(<Page />)

    await ready('Cindy')
    expect(displayName()).toBe('Cindy Sister Bartolome')
    expect(menu('Cindy').value).toBe('first')
    expect(menu('Sister').value).toBe('skip')
    expect(menu('Bartolome').value).toBe('last')
    expect(box('first_name').value).toBe('Cindy')
    expect(box('last_name').value).toBe('Bartolome')
    expect(screen.getByText('Title word left out')).toBeInTheDocument()
  })

  it('reads last name first, then a menu moves one word', async () => {
    const user = userEvent.setup()
    getQueue.mockResolvedValue({ items: [item('m1', 'Abando Chloe Gail')], counts })
    render(<Page />)
    await ready('Abando')

    // Default guess puts the surname at the end.
    expect(box('last_name').value).toBe('Gail')

    await user.click(screen.getByRole('button', { name: 'Last name first' }))
    expect(menu('Abando').value).toBe('last')
    expect(box('first_name').value).toBe('Chloe')
    expect(box('middle_name').value).toBe('Gail')
    expect(box('last_name').value).toBe('Abando')

    await user.selectOptions(menu('Gail'), 'first')
    expect(box('first_name').value).toBe('Chloe Gail')
    expect(box('middle_name').value).toBe('')
  })

  it('moves the middle word with the quick fixes', async () => {
    const user = userEvent.setup()
    getQueue.mockResolvedValue({ items: [item('m1', 'John Paul Reyes')], counts })
    render(<Page />)
    await ready('John')

    await user.click(screen.getByRole('button', { name: 'Middle joins first' }))
    expect(box('first_name').value).toBe('John Paul')
    expect(menu('Paul').value).toBe('first')
    expect(screen.getByRole('button', { name: 'Middle joins first' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Reset guess' }))
    expect(box('middle_name').value).toBe('Paul')
  })

  it('confirms the parts with the name it showed, then opens the next member', async () => {
    const user = userEvent.setup()
    getQueue.mockResolvedValue({ items: [item('m1', 'Abando Chloe Gail'), item('m2', 'Juan C. Cruz')], counts })
    confirm.mockImplementation(async ({ data }) =>
      item(data.id, data.name, {
        first_name: data.first_name,
        middle_name: data.middle_name,
        last_name: data.last_name,
        suffix: data.suffix,
        name_parts_status: 'confirmed',
      }),
    )
    render(<Page />)
    await ready('Abando')

    await user.click(screen.getByRole('button', { name: 'Last name first' }))
    await user.selectOptions(menu('Gail'), 'first')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await ready('Juan')
    expect(displayName()).toBe('Juan C. Cruz')
    expect(confirm).toHaveBeenCalledWith({
      data: {
        accessToken: 'token-1',
        id: 'm1',
        name: 'Abando Chloe Gail',
        first_name: 'Chloe Gail',
        middle_name: null,
        last_name: 'Abando',
        suffix: null,
      },
    })
    expect(screen.getByText('Confirmed 1 of 3.')).toBeInTheDocument()
  })

  it('shows a confirmed split as menus mapped from the stored parts', async () => {
    getQueue.mockResolvedValue({
      items: [
        item('m1', 'Abando Chloe Gail', { first_name: 'Chloe Gail', last_name: 'Abando', name_parts_status: 'confirmed' }),
      ],
      counts,
    })
    render(<Page />)
    await ready('Abando')

    expect(menu('Abando').value).toBe('last')
    expect(menu('Chloe').value).toBe('first')
    expect(menu('Gail').value).toBe('first')
    expect(within(screen.getByText('Display name').closest('form')!).getByText('Confirmed')).toBeInTheDocument()
  })

  it('ignores a slower response for a list no longer shown', async () => {
    const user = userEvent.setup()
    let resolvePending: (v: unknown) => void = () => {}
    getQueue.mockImplementation(({ data }) =>
      data.status === 'pending'
        ? new Promise((r) => (resolvePending = r))
        : Promise.resolve({ items: [item('a1', 'Auto Person', { first_name: 'Auto', last_name: 'Person', name_parts_status: 'auto' })], counts }),
    )
    render(<Page />)

    await user.click(screen.getByRole('button', { name: /Auto split/ }))
    await ready('Auto')

    resolvePending({ items: [item('p1', 'Pending Person')], counts })
    await waitFor(() => expect(getQueue).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByLabelText('Part for Pending')).not.toBeInTheDocument()
    expect(displayName()).toBe('Auto Person')
  })
})
