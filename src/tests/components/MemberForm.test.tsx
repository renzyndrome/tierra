// Quest Laguna Directory - MemberForm Component Tests
// Tests for the member form with validation and data handling

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberForm } from '../../components/MemberForm'
import { createMockCellGroup, createMockMember, createMockSatelliteRow, resetFactoryCounters } from '../factories'

// Mock the storage module
vi.mock('../../lib/storage', () => ({
  uploadMemberPhoto: vi.fn().mockResolvedValue({ url: 'https://test.com/photo.jpg', error: null }),
  getPlaceholderAvatar: (name: string) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
}))

// Types a first and last name into the split name boxes.
async function typeName(user: ReturnType<typeof userEvent.setup>, first: string, last: string) {
  await user.type(screen.getByPlaceholderText('First name'), first)
  await user.type(screen.getByPlaceholderText('Last name'), last)
}

describe('MemberForm Component', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()
  const mockSatellites = [
    createMockSatelliteRow({ id: 'sat-1', name: 'Quest Laguna Main' }),
    createMockSatelliteRow({ id: 'sat-2', name: 'Quest Binan' }),
    createMockSatelliteRow({ id: 'sat-3', name: 'Quest Sta. Rosa' }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    resetFactoryCounters()
  })

  // ============================================
  // RENDER TESTS
  // ============================================
  describe('Rendering', () => {
    it('should render the form with all required fields', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      // Check required fields
      expect(screen.getByPlaceholderText('First name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Middle name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Last name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Suffix')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('City')).toBeInTheDocument()
      expect(screen.getByText('Discipleship Stage')).toBeInTheDocument()
    })

    it('should render optional fields', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('09XX XXX XXXX')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Age')).toBeInTheDocument()
    })

    it('should render satellite options from props', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Quest Laguna Main')).toBeInTheDocument()
      expect(screen.getByText('Quest Binan')).toBeInTheDocument()
      expect(screen.getByText('Quest Sta. Rosa')).toBeInTheDocument()
    })

    it('should render Create Member button for new member', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Create Member')).toBeInTheDocument()
    })

    it('should render Update Member button when editing', () => {
      const existingMember = createMockMember()

      render(
        <MemberForm
          member={existingMember}
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Update Member')).toBeInTheDocument()
    })
  })

  // ============================================
  // FORM PRE-POPULATION TESTS
  // ============================================
  describe('Form Pre-population', () => {
    it('should pre-fill form when editing existing member', () => {
      const existingMember = createMockMember({
        name: 'John Doe',
        email: 'john@example.com',
        city: 'Laguna',
        phone: '09171234567',
      })

      render(
        <MemberForm
          member={existingMember}
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      // No stored split: the boxes start from a guess and a hint says so.
      expect(screen.getByPlaceholderText('First name')).toHaveValue('John')
      expect(screen.getByPlaceholderText('Last name')).toHaveValue('Doe')
      expect(screen.getByText('Guessed split. Saved only after a name edit.')).toBeInTheDocument()
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Laguna')).toBeInTheDocument()
      expect(screen.getByDisplayValue('09171234567')).toBeInTheDocument()
    })

    it('should start with empty fields for new member', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      for (const placeholder of ['First name', 'Middle name', 'Last name', 'Suffix']) {
        expect(screen.getByPlaceholderText(placeholder)).toHaveValue('')
      }
    })
  })

  // ============================================
  // VALIDATION TESTS
  // ============================================
  describe('Form Validation', () => {
    it('should require a first and a last name', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await user.click(screen.getByText('Create Member'))

      expect(screen.getByText('First name required.')).toBeInTheDocument()
      expect(screen.getByText('Last name required.')).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('should not submit with a first name only', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await user.type(screen.getByPlaceholderText('First name'), 'Bong')
      await user.click(screen.getByText('Create Member'))

      expect(screen.queryByText('First name required.')).not.toBeInTheDocument()
      expect(screen.getByText('Last name required.')).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('should allow submit without a city (city is optional)', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await typeName(user, 'John', 'Doe')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      // City is intentionally not a required field (see validate() in MemberForm).
      expect(screen.queryByText(/city is required/i)).not.toBeInTheDocument()
      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    })

    it('should validate email format on form submit', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      const emailInput = screen.getByPlaceholderText('email@example.com')
      await user.type(emailInput, 'invalid-email')

      await typeName(user, 'John', 'Doe')

      const cityInput = screen.getByPlaceholderText('City')
      await user.type(cityInput, 'Laguna')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      // When email is invalid, the form should not submit
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('should clear error when field is corrected', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await user.type(screen.getByPlaceholderText('First name'), 'Alice')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      expect(screen.getByText('Last name required.')).toBeInTheDocument()

      // Type a last name to fix the error
      await user.type(screen.getByPlaceholderText('Last name'), 'Reyes')

      // Error should be gone
      expect(screen.queryByText('Last name required.')).not.toBeInTheDocument()
    })
  })

  // ============================================
  // FORM SUBMISSION TESTS
  // ============================================
  describe('Form Submission', () => {
    it('should submit form with valid data', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await typeName(user, 'John', 'Doe')
      await user.type(screen.getByPlaceholderText('City'), 'Laguna')
      await user.type(screen.getByPlaceholderText('email@example.com'), 'john@example.com')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1)
      })

      const submitData = mockOnSubmit.mock.calls[0][0]
      expect(submitData.name).toBe('John Doe')
      expect(submitData.first_name).toBe('John')
      expect(submitData.middle_name).toBeNull()
      expect(submitData.last_name).toBe('Doe')
      expect(submitData.suffix).toBeNull()
      expect(submitData.city).toBe('Laguna')
      expect(submitData.email).toBe('john@example.com')
    })

    it('should include discipleship stage default value', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await typeName(user, 'John', 'Doe')
      await user.type(screen.getByPlaceholderText('City'), 'Laguna')

      await user.click(screen.getByText('Create Member'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })

      const submitData = mockOnSubmit.mock.calls[0][0]
      expect(submitData.discipleship_stage).toBe('Newbie')
    })
  })

  // ============================================
  // CANCEL BUTTON TESTS
  // ============================================
  describe('Cancel Button', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      expect(mockOnCancel).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================
  // LOADING STATE TESTS
  // ============================================
  describe('Loading State', () => {
    it('should disable buttons when submitting', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      )

      expect(screen.getByText('Cancel').closest('button')).toBeDisabled()
      expect(screen.getByText('Create Member').closest('button')).toBeDisabled()
    })

    it('should show loading spinner when submitting', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      )

      // Check for the spinner element
      const submitButton = screen.getByText('Create Member').closest('button')
      expect(submitButton?.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })

  // ============================================
  // TEXTAREA FIELDS TESTS
  // ============================================
  describe('Textarea Fields', () => {
    it('should render bio field', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByPlaceholderText('Brief introduction...')).toBeInTheDocument()
    })

    it('should render spiritual journey field', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByPlaceholderText('Share your spiritual journey...')).toBeInTheDocument()
    })

    it('should render prayer needs field', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByPlaceholderText('How can we pray for you?')).toBeInTheDocument()
    })
  })

  // ============================================
  // EMERGENCY CONTACT TESTS
  // ============================================
  describe('Emergency Contact', () => {
    it('should render emergency contact fields', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByPlaceholderText('Emergency contact name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Emergency contact phone')).toBeInTheDocument()
    })

    it('should include emergency contact in submission', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await typeName(user, 'John', 'Doe')
      await user.type(screen.getByPlaceholderText('City'), 'Laguna')
      await user.type(screen.getByPlaceholderText('Emergency contact name'), 'Jane Doe')
      await user.type(screen.getByPlaceholderText('Emergency contact phone'), '09181234567')

      await user.click(screen.getByText('Create Member'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })

      const submitData = mockOnSubmit.mock.calls[0][0]
      expect(submitData.emergency_contact_name).toBe('Jane Doe')
      expect(submitData.emergency_contact_phone).toBe('09181234567')
    })
  })

  // ============================================
  // PHOTO UPLOAD TESTS
  // ============================================
  describe('Photo Upload', () => {
    it('should render photo upload area', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Upload a profile photo')).toBeInTheDocument()
      expect(screen.getByText('JPEG, PNG, WebP, GIF. Max 5MB.')).toBeInTheDocument()
    })

    it('should show placeholder avatar for new member', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      const avatar = screen.getByAltText('Profile') as HTMLImageElement
      expect(avatar.src).toContain('ui-avatars.com')
    })
  })

  // ============================================
  // FORM SECTIONS TESTS
  // ============================================
  describe('Form Sections', () => {
    it('should render Church Information section', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Church Information')).toBeInTheDocument()
    })

    it('should render Profile section', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Profile')).toBeInTheDocument()
    })

    it('should render Emergency Contact section', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Emergency Contact')).toBeInTheDocument()
    })
  })

  // ============================================
  // MEMBERSHIP STATUS TESTS
  // ============================================
  describe('Membership Status', () => {
    it('should render all membership status options', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByRole('option', { name: 'Visitor' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Regular' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Inactive' })).toBeInTheDocument()
    })

    it('should have active status as default', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      await typeName(user, 'John', 'Doe')
      await user.type(screen.getByPlaceholderText('City'), 'Laguna')

      await user.click(screen.getByText('Create Member'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })

      const submitData = mockOnSubmit.mock.calls[0][0]
      expect(submitData.membership_status).toBe('active')
    })
  })

  // ============================================
  // GENDER FIELD TESTS
  // ============================================
  describe('Gender Field', () => {
    it('should render gender options', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByRole('option', { name: 'Male' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Female' })).toBeInTheDocument()
    })

    it('should render Select gender option', () => {
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByRole('option', { name: 'Select gender' })).toBeInTheDocument()
    })
  })

  // ============================================
  // DISCIPLESHIP STAGE TESTS
  // ============================================
  describe('Discipleship Stage', () => {
    it('should render all discipleship stage options', () => {
      const { container } = render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      // Scoped to the stage select: 'Leader' also appears in other dropdowns.
      const stageSelect = container.querySelector<HTMLSelectElement>(
        'select[name="discipleship_stage"]',
      )
      expect(stageSelect).not.toBeNull()

      const options = Array.from(stageSelect!.options)
      // DB values stay Newbie/Growing/Leader; labels are the display names.
      expect(options.map((o) => o.value)).toEqual(['Newbie', 'Growing', 'Leader'])
      expect(options.map((o) => o.textContent)).toEqual([
        'New Friends',
        'Schooling',
        'Leader',
      ])
    })
  })
})

// ============================================
// DISCIPLER PICKS THE QUEST CIRCLE
// ============================================
describe('MemberForm discipler and Quest Circle', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()
  const satellites = [createMockSatelliteRow({ id: 'sat-1', name: 'Quest Laguna Main' })]
  const members = [
    { id: 'disc-one', name: 'Discipler One' },
    { id: 'disc-two', name: 'Discipler Two' },
    { id: 'disc-none', name: 'Discipler None' },
  ]
  const circles = [
    createMockCellGroup({ id: 'circle-a', name: 'Circle A', leader_id: 'disc-one', co_leader_id: null }),
    createMockCellGroup({ id: 'circle-b', name: 'Circle B', leader_id: 'disc-two', co_leader_id: null }),
    createMockCellGroup({ id: 'circle-c', name: 'Circle C', leader_id: 'someone-else', co_leader_id: 'disc-two' }),
    createMockCellGroup({ id: 'circle-d', name: 'Circle D', leader_id: 'someone-else', co_leader_id: null }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    resetFactoryCounters()
  })

  function renderForm() {
    render(
      <MemberForm
        satellites={satellites}
        cellGroups={circles}
        allMembers={members}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )
  }

  async function pickDiscipler(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.type(screen.getByPlaceholderText('Search discipler...'), name)
    await user.click(screen.getByRole('button', { name }))
  }

  it('lists every circle while no discipler is chosen', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByPlaceholderText('Search Quest Circle...'))

    for (const name of ['Circle A', 'Circle B', 'Circle C', 'Circle D']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('preselects the only circle a discipler leads and submits it', async () => {
    const user = userEvent.setup()
    renderForm()

    await typeName(user, 'Plain', 'Member')
    await pickDiscipler(user, 'Discipler One')

    expect(screen.getByText('Circle A')).toBeInTheDocument()
    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()

    await user.click(screen.getByText('Create Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockOnSubmit.mock.calls[0][0].discipler_id).toBe('disc-one')
    expect(mockOnSubmit.mock.calls[0][1]).toBe('circle-a')
  })

  it('requires a choice when the discipler leads or co-leads two circles', async () => {
    const user = userEvent.setup()
    renderForm()

    await typeName(user, 'Plain', 'Member')
    await pickDiscipler(user, 'Discipler Two')

    expect(screen.getByText('Choose a Quest Circle.')).toBeInTheDocument()
    expect(screen.getByText('Create Member').closest('button')).toBeDisabled()

    await user.click(screen.getByPlaceholderText('Search Quest Circle...'))
    expect(screen.getByRole('button', { name: 'Circle B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Circle C' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Circle A' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Circle D' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Circle C' }))

    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()
    expect(screen.getByText('Create Member').closest('button')).toBeEnabled()

    await user.click(screen.getByText('Create Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockOnSubmit.mock.calls[0][1]).toBe('circle-c')
  })

  it('accepts "No Quest Circle" as the choice', async () => {
    const user = userEvent.setup()
    renderForm()

    await typeName(user, 'Plain', 'Member')
    await pickDiscipler(user, 'Discipler Two')
    await user.click(screen.getByPlaceholderText('Search Quest Circle...'))
    await user.click(screen.getByRole('button', { name: 'No Quest Circle' }))

    expect(screen.getByText('Create Member').closest('button')).toBeEnabled()

    await user.click(screen.getByText('Create Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockOnSubmit.mock.calls[0][1]).toBeNull()
  })

  it('leaves the field empty when the discipler leads no circle', async () => {
    const user = userEvent.setup()
    renderForm()

    await pickDiscipler(user, 'Discipler None')

    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()
    await user.click(screen.getByPlaceholderText('Search Quest Circle...'))
    expect(screen.getByRole('button', { name: 'No Quest Circle' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Circle A' })).not.toBeInTheDocument()
  })

  it('keeps the current circle on an edit until a discipler is picked', () => {
    render(
      <MemberForm
        member={createMockMember({ id: 'member-x', discipler_id: 'disc-one' })}
        satellites={satellites}
        cellGroups={circles}
        currentCellGroupId="circle-d"
        allMembers={members}
        currentDisciplerId="disc-one"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText('Circle D')).toBeInTheDocument()
    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()
    expect(screen.getByText('Update Member').closest('button')).toBeEnabled()
  })
  // The edited member co-leads Circle A and leads Circle C.
  const ownCircles = [
    createMockCellGroup({ id: 'circle-a', name: 'Circle A', leader_id: 'disc-one', co_leader_id: 'member-lead' }),
    createMockCellGroup({ id: 'circle-b', name: 'Circle B', leader_id: 'disc-two', co_leader_id: null }),
    createMockCellGroup({ id: 'circle-c', name: 'Circle C', leader_id: 'member-lead', co_leader_id: 'disc-two' }),
    createMockCellGroup({ id: 'circle-d', name: 'Circle D', leader_id: 'someone-else', co_leader_id: null }),
  ]

  function renderEditOfLeader() {
    render(
      <MemberForm
        member={createMockMember({ id: 'member-lead', discipler_id: null })}
        satellites={satellites}
        cellGroups={ownCircles}
        currentCellGroupId={null}
        allMembers={members}
        currentDisciplerId={null}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )
  }

  it('does not offer circles the edited member leads or co-leads', async () => {
    const user = userEvent.setup()
    renderEditOfLeader()

    await user.click(screen.getByPlaceholderText('Search Quest Circle...'))
    expect(screen.queryByRole('button', { name: 'Circle A' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Circle C' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Circle B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Circle D' })).toBeInTheDocument()
  })

  it("never preselects the edited member's own circle after a discipler pick", async () => {
    const user = userEvent.setup()
    renderEditOfLeader()

    await pickDiscipler(user, 'Discipler One')
    expect(screen.queryByText('Circle A')).not.toBeInTheDocument()
    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()
  })

  it("counts only the discipler's other circles toward the choice rule", async () => {
    const user = userEvent.setup()
    renderEditOfLeader()

    // Discipler Two leads Circle B and co-leads Circle C, which the member leads.
    await pickDiscipler(user, 'Discipler Two')
    expect(screen.getByText('Circle B')).toBeInTheDocument()
    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()
    expect(screen.getByText('Update Member').closest('button')).toBeEnabled()
  })

  it('holds the Discipler field while the Quest Circle list loads', () => {
    render(
      <MemberForm
        satellites={satellites}
        cellGroups={[]}
        circlesLoad="loading"
        allMembers={members}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.queryByPlaceholderText('Search discipler...')).not.toBeInTheDocument()
    expect(screen.getByText('Loading Quest Circles...')).toBeInTheDocument()
  })

  it('shows the Discipler field and a reload line when the Quest Circle list failed', async () => {
    const user = userEvent.setup()
    render(
      <MemberForm
        satellites={satellites}
        circlesLoad="failed"
        allMembers={members}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText('Quest Circles not loaded. Reload to assign a circle.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search Quest Circle...')).not.toBeInTheDocument()

    await typeName(user, 'Plain', 'Member')
    await pickDiscipler(user, 'Discipler One')
    await user.click(screen.getByText('Create Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockOnSubmit.mock.calls[0][0].discipler_id).toBe('disc-one')
    expect(mockOnSubmit.mock.calls[0][1]).toBeUndefined()
  })

  // A stored discipler missing from allMembers: archived (getAllMembersLite
  // leaves archived members out).
  function renderEditWithArchivedDiscipler(currentDiscipler?: { id: string; name: string } | null) {
    render(
      <MemberForm
        member={createMockMember({ id: 'member-x', discipler_id: 'disc-archived' })}
        satellites={satellites}
        cellGroups={circles}
        currentCellGroupId={null}
        allMembers={members}
        currentDisciplerId="disc-archived"
        currentDiscipler={currentDiscipler}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )
  }

  it('shows an archived discipler as "Archived member" with a Clear action', () => {
    renderEditWithArchivedDiscipler()

    expect(screen.getByText('Archived member')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search discipler...')).not.toBeInTheDocument()
  })

  it('names an archived discipler when the edit page supplies the name', () => {
    renderEditWithArchivedDiscipler({ id: 'disc-archived', name: 'Former Discipler' })

    expect(screen.getByText('Former Discipler')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('lists every circle for an archived discipler instead of narrowing to none', async () => {
    const user = userEvent.setup()
    renderEditWithArchivedDiscipler()

    await user.click(screen.getByPlaceholderText('Search Quest Circle...'))
    for (const name of ['Circle A', 'Circle B', 'Circle C', 'Circle D']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('keeps the archived discipler on save, and clears it with Clear', async () => {
    const user = userEvent.setup()
    renderEditWithArchivedDiscipler()

    await user.click(screen.getByText('Update Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1))
    expect(mockOnSubmit.mock.calls[0][0].discipler_id).toBe('disc-archived')

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByPlaceholderText('Search discipler...')).toBeInTheDocument()
    await user.click(screen.getByText('Update Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(2))
    expect(mockOnSubmit.mock.calls[1][0].discipler_id).toBeNull()
  })

  it('has no Quest Circle field and submits no circle when no circles are passed (no cell_groups.write)', async () => {
    const user = userEvent.setup()
    render(
      <MemberForm
        satellites={satellites}
        allMembers={members}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.queryByPlaceholderText('Search Quest Circle...')).not.toBeInTheDocument()
    await typeName(user, 'Plain', 'Member')
    await pickDiscipler(user, 'Discipler Two')
    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()
    await user.click(screen.getByText('Create Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockOnSubmit.mock.calls[0][0].discipler_id).toBe('disc-two')
    expect(mockOnSubmit.mock.calls[0][1]).toBeUndefined()
  })
})

describe('MemberForm Quest Circle field: teams', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()
  const satellites = [createMockSatelliteRow({ id: 'sat-1', name: 'Quest Laguna Main' })]
  const members = [{ id: 'disc-one', name: 'Discipler One' }]
  // Discipler One leads Circle A and the team.
  const groups = [
    createMockCellGroup({ id: 'circle-a', name: 'Circle A', leader_id: 'disc-one', co_leader_id: null }),
    createMockCellGroup({ id: 'team-t', name: 'Worship Team', leader_id: 'disc-one', co_leader_id: null, is_team: true }),
    createMockCellGroup({ id: 'circle-d', name: 'Circle D', leader_id: 'someone-else', co_leader_id: null }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    resetFactoryCounters()
  })

  function renderForm() {
    render(
      <MemberForm
        satellites={satellites}
        cellGroups={groups}
        allMembers={members}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )
  }

  it('never lists a team', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByPlaceholderText('Search Quest Circle...'))
    expect(screen.getByRole('button', { name: 'Circle A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Circle D' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Worship Team' })).not.toBeInTheDocument()
  })

  it("preselects the discipler's one circle; the team they lead does not count", async () => {
    const user = userEvent.setup()
    renderForm()

    await typeName(user, 'Plain', 'Member')
    await user.type(screen.getByPlaceholderText('Search discipler...'), 'Discipler One')
    await user.click(screen.getByRole('button', { name: 'Discipler One' }))

    expect(screen.getByText('Circle A')).toBeInTheDocument()
    expect(screen.queryByText('Choose a Quest Circle.')).not.toBeInTheDocument()

    await user.click(screen.getByText('Create Member'))
    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled())
    expect(mockOnSubmit.mock.calls[0][1]).toBe('circle-a')
  })
})

describe('MemberForm split name', () => {
  const satellites = [createMockSatelliteRow({ id: 'sat-1', name: 'Quest Laguna Main' })]

  beforeEach(() => {
    vi.clearAllMocks()
    resetFactoryCounters()
  })

  it('composes name from all four parts on create', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<MemberForm satellites={satellites} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('First name'), ' Juan ')
    await user.type(screen.getByPlaceholderText('Middle name'), 'C.')
    await user.type(screen.getByPlaceholderText('Last name'), 'Dela Cruz')
    await user.type(screen.getByPlaceholderText('Suffix'), 'Jr.')
    await user.click(screen.getByText('Create Member'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const data = onSubmit.mock.calls[0][0]
    expect(data.name).toBe('Juan C. Dela Cruz Jr.')
    expect(data).toMatchObject({ first_name: 'Juan', middle_name: 'C.', last_name: 'Dela Cruz', suffix: 'Jr.' })
  })

  it('refuses a full name over 100 characters', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<MemberForm satellites={satellites} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('First name'), 'A'.repeat(50))
    await user.type(screen.getByPlaceholderText('Last name'), 'B'.repeat(55))
    await user.click(screen.getByText('Create Member'))

    expect(screen.getByText('Full name over 100 characters. Shorten a part.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a stored confirmed split with no hint', () => {
    const member = createMockMember({
      name: 'Juan Carlo Cruz',
      first_name: 'Juan Carlo',
      last_name: 'Cruz',
      name_parts_status: 'confirmed',
    })
    render(<MemberForm member={member} satellites={satellites} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByPlaceholderText('First name')).toHaveValue('Juan Carlo')
    expect(screen.getByPlaceholderText('Middle name')).toHaveValue('')
    expect(screen.getByPlaceholderText('Last name')).toHaveValue('Cruz')
    expect(screen.queryByText(/Guessed split/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Auto split/)).not.toBeInTheDocument()
  })

  it('marks an auto split', () => {
    const member = createMockMember({ name: 'Juan Cruz', first_name: 'Juan', last_name: 'Cruz', name_parts_status: 'auto' })
    render(<MemberForm member={member} satellites={satellites} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText('Auto split from a two-word name.')).toBeInTheDocument()
  })

  it('sends no name parts when only another field changes', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const member = createMockMember({ name: 'Maria  Santos Reyes', phone: null })
    render(<MemberForm member={member} satellites={satellites} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('09XX XXX XXXX'), '09171234567')
    await user.click(screen.getByText('Update Member'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const data = onSubmit.mock.calls[0][0]
    expect(data.name).toBe('Maria  Santos Reyes')
    expect(data.phone).toBe('09171234567')
    for (const key of ['first_name', 'middle_name', 'last_name', 'suffix']) {
      expect(key in data).toBe(false)
    }
  })

  it('does not block an unrelated edit when the guess has no last name', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const member = createMockMember({ name: 'Bong' })
    render(<MemberForm member={member} satellites={satellites} onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.click(screen.getByText('Update Member'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].name).toBe('Bong')
  })

  it('sends the parts and the rebuilt name after a name edit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const member = createMockMember({ name: 'John Paul Reyes' })
    render(<MemberForm member={member} satellites={satellites} onSubmit={onSubmit} onCancel={vi.fn()} />)

    // Guess: John / Paul / Reyes. "Paul" belongs to the first name.
    await user.clear(screen.getByPlaceholderText('Middle name'))
    await user.clear(screen.getByPlaceholderText('First name'))
    await user.type(screen.getByPlaceholderText('First name'), 'John Paul')

    expect(screen.queryByText(/Display name on save/)).not.toBeInTheDocument()
    await user.click(screen.getByText('Update Member'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const data = onSubmit.mock.calls[0][0]
    expect(data).toMatchObject({ name: 'John Paul Reyes', first_name: 'John Paul', middle_name: null, last_name: 'Reyes', suffix: null })
  })

  it('shows the new display name when a name edit changes it', async () => {
    const user = userEvent.setup()
    const member = createMockMember({ name: 'Juan Cruz' })
    render(<MemberForm member={member} satellites={satellites} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Suffix'), 'Jr.')

    expect(screen.getByText('Display name on save: Juan Cruz Jr.')).toBeInTheDocument()
  })
})
