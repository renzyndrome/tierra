// Quest Laguna Directory - MemberForm Component Tests
// Tests for the member form with validation and data handling

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberForm } from '../../components/MemberForm'
import { createMockMember, createMockSatelliteRow, resetFactoryCounters } from '../factories'

// Mock the storage module
vi.mock('../../lib/storage', () => ({
  uploadMemberPhoto: vi.fn().mockResolvedValue({ url: 'https://test.com/photo.jpg', error: null }),
  getPlaceholderAvatar: (name: string) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
}))

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
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument()
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

      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument()
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

      const nameInput = screen.getByPlaceholderText('Full name') as HTMLInputElement
      expect(nameInput.value).toBe('')
    })
  })

  // ============================================
  // VALIDATION TESTS
  // ============================================
  describe('Form Validation', () => {
    it('should show error when name is too short', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      const nameInput = screen.getByPlaceholderText('Full name')
      await user.type(nameInput, 'A')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('should show error when city is not provided', async () => {
      const user = userEvent.setup()

      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      const nameInput = screen.getByPlaceholderText('Full name')
      await user.type(nameInput, 'John Doe')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      expect(screen.getByText('City is required')).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
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

      const nameInput = screen.getByPlaceholderText('Full name')
      await user.type(nameInput, 'John Doe')

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

      const nameInput = screen.getByPlaceholderText('Full name')
      await user.type(nameInput, 'A')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument()

      // Type more characters to fix the error
      await user.type(nameInput, 'lice')

      // Error should be gone
      expect(screen.queryByText('Name must be at least 2 characters')).not.toBeInTheDocument()
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

      await user.type(screen.getByPlaceholderText('Full name'), 'John Doe')
      await user.type(screen.getByPlaceholderText('City'), 'Laguna')
      await user.type(screen.getByPlaceholderText('email@example.com'), 'john@example.com')

      const submitButton = screen.getByText('Create Member')
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1)
      })

      const submitData = mockOnSubmit.mock.calls[0][0]
      expect(submitData.name).toBe('John Doe')
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

      await user.type(screen.getByPlaceholderText('Full name'), 'John Doe')
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

      await user.type(screen.getByPlaceholderText('Full name'), 'John Doe')
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

      await user.type(screen.getByPlaceholderText('Full name'), 'John Doe')
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
      render(
        <MemberForm
          satellites={mockSatellites}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByRole('option', { name: 'Newbie' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Growing' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Leader' })).toBeInTheDocument()
    })
  })
})
