// Quest Laguna Directory - Member Form Component

import { useState, useEffect } from 'react'
import type { Member, MemberInsert, SatelliteRow } from '../lib/types'
import { uploadMemberPhoto, getPlaceholderAvatar } from '../lib/storage'
import { CIVIL_STATUSES, MEMBER_CATEGORIES, FOLLOW_THROUGH_STAGES, DISCIPLESHIP_JOURNEY_STAGES, LEADERSHIP_LEVELS } from '../lib/constants'

interface MemberFormProps {
  member?: Member | null
  satellites: SatelliteRow[]
  onSubmit: (data: MemberInsert) => Promise<void>
  onCancel: () => void
  isSubmitting?: boolean
}

export function MemberForm({
  member,
  satellites,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: MemberFormProps) {
  const [formData, setFormData] = useState<MemberInsert>({
    name: '',
    email: null,
    phone: null,
    age: null,
    birthday: null,
    gender: null,
    city: '',
    address: null,
    satellite_id: null,
    discipleship_stage: 'Newbie',
    membership_status: 'active',
    joined_date: null,
    photo_url: null,
    bio: null,
    spiritual_description: null,
    prayer_needs: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    civil_status: null,
    spouse_name: null,
    wedding_anniversary: null,
    num_children: null,
    member_category: null,
    follow_through: null,
    discipleship_journey: null,
    leadership_level: 'Member',
    community: null,
    facebook_url: null,
    spiritual_name: null,
    is_vision_keeper: false,
    is_full_time: false,
  })

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize form with member data if editing
  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name,
        email: member.email,
        phone: member.phone,
        age: member.age,
        birthday: member.birthday,
        gender: member.gender,
        city: member.city,
        address: member.address,
        satellite_id: member.satellite_id,
        discipleship_stage: member.discipleship_stage,
        membership_status: member.membership_status,
        joined_date: member.joined_date,
        photo_url: member.photo_url,
        bio: member.bio,
        spiritual_description: member.spiritual_description,
        prayer_needs: member.prayer_needs,
        emergency_contact_name: member.emergency_contact_name,
        emergency_contact_phone: member.emergency_contact_phone,
        civil_status: member.civil_status,
        spouse_name: member.spouse_name,
        wedding_anniversary: member.wedding_anniversary,
        num_children: member.num_children,
        member_category: member.member_category,
        follow_through: member.follow_through,
        discipleship_journey: member.discipleship_journey,
        leadership_level: member.leadership_level,
        community: member.community,
        facebook_url: member.facebook_url,
        spiritual_name: member.spiritual_name,
        is_vision_keeper: member.is_vision_keeper,
        is_full_time: member.is_full_time,
      })
      setPhotoPreview(member.photo_url)
    }
  }, [member])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target

    let parsedValue: string | number | boolean | null = value

    if (type === 'checkbox') {
      parsedValue = (e.target as HTMLInputElement).checked
    } else if (type === 'number') {
      parsedValue = value ? parseInt(value, 10) : null
    } else if (value === '') {
      parsedValue = null
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }))

    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name || formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    if (!formData.city || formData.city.length < 2) {
      newErrors.city = 'City is required'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address'
    }

    if (formData.age && (formData.age < 1 || formData.age > 120)) {
      newErrors.age = 'Age must be between 1 and 120'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    let photoUrl = formData.photo_url

    // Upload photo if selected
    if (photoFile) {
      setUploadingPhoto(true)
      const tempId = member?.id || `temp-${Date.now()}`
      const { url, error } = await uploadMemberPhoto(tempId, photoFile)
      setUploadingPhoto(false)

      if (error) {
        setErrors((prev) => ({ ...prev, photo: error.message }))
        return
      }

      photoUrl = url
    }

    await onSubmit({
      ...formData,
      photo_url: photoUrl,
    })
  }

  const avatarUrl = photoPreview || getPlaceholderAvatar(formData.name || 'New Member')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Photo Upload */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <img
            src={avatarUrl}
            alt="Profile"
            className="w-24 h-24 rounded-full object-cover"
          />
          <label className="absolute bottom-0 right-0 p-1 bg-[#8B1538] rounded-full cursor-pointer hover:bg-[#6B0F2B] transition-colors">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </label>
        </div>
        <div>
          <p className="text-sm text-gray-600">Upload a profile photo</p>
          <p className="text-xs text-gray-400">JPEG, PNG, WebP, GIF. Max 5MB.</p>
          {errors.photo && <p className="text-xs text-red-500 mt-1">{errors.photo}</p>}
        </div>
      </div>

      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none ${
              errors.name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Full name"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={formData.email || ''}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="email@example.com"
          />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            value={formData.phone || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            placeholder="09XX XXX XXXX"
          />
        </div>

        {/* Facebook URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Facebook URL</label>
          <input
            type="url"
            name="facebook_url"
            value={formData.facebook_url || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            placeholder="https://facebook.com/username"
          />
        </div>

        {/* Age */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
          <input
            type="number"
            name="age"
            value={formData.age || ''}
            onChange={handleChange}
            min="1"
            max="120"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none ${
              errors.age ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Age"
          />
          {errors.age && <p className="text-xs text-red-500 mt-1">{errors.age}</p>}
        </div>

        {/* Birthday */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Birthday</label>
          <input
            type="date"
            name="birthday"
            value={formData.birthday || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
          <select
            name="gender"
            value={formData.gender || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none ${
              errors.city ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="City"
          />
          {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            type="text"
            name="address"
            value={formData.address || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            placeholder="Full address"
          />
        </div>
      </div>

      {/* Church Information */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Church Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Satellite */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Satellite</label>
            <select
              name="satellite_id"
              value={formData.satellite_id || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              <option value="">Select satellite</option>
              {satellites.map((sat) => (
                <option key={sat.id} value={sat.id}>
                  {sat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Discipleship Stage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Discipleship Stage <span className="text-red-500">*</span>
            </label>
            <select
              name="discipleship_stage"
              value={formData.discipleship_stage}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              <option value="Newbie">Newbie</option>
              <option value="Growing">Growing</option>
              <option value="Leader">Leader</option>
            </select>
          </div>

          {/* Membership Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Membership Status</label>
            <select
              name="membership_status"
              value={formData.membership_status || 'active'}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              <option value="visitor">Visitor</option>
              <option value="regular">Regular</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Joined Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Joined Date</label>
            <input
              type="date"
              name="joined_date"
              value={formData.joined_date || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            />
          </div>

          {/* Member Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              name="member_category"
              value={formData.member_category || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              <option value="">Select category</option>
              {MEMBER_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Leadership Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leadership Level</label>
            <select
              name="leadership_level"
              value={formData.leadership_level || 'Member'}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              {LEADERSHIP_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
          </div>

          {/* Discipleship Journey */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discipleship Journey</label>
            <select
              name="discipleship_journey"
              value={formData.discipleship_journey || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              <option value="">Select journey stage</option>
              {DISCIPLESHIP_JOURNEY_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
          </div>

          {/* Follow Through */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Follow Through</label>
            <select
              name="follow_through"
              value={formData.follow_through || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              <option value="">Select stage</option>
              {FOLLOW_THROUGH_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
          </div>

          {/* Community */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Community</label>
            <input
              type="text"
              name="community"
              value={formData.community || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
              placeholder="Sub-area (e.g., Dela Paz)"
            />
          </div>
        </div>
      </div>

      {/* Personal Details */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Civil Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Civil Status</label>
            <select
              name="civil_status"
              value={formData.civil_status || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
            >
              <option value="">Select status</option>
              {CIVIL_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>

          {/* Num Children */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Children</label>
            <input
              type="number"
              name="num_children"
              value={formData.num_children ?? ''}
              onChange={handleChange}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
              placeholder="0"
            />
          </div>

          {/* Spouse Name (show when married) */}
          {formData.civil_status === 'married' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Spouse Name</label>
                <input
                  type="text"
                  name="spouse_name"
                  value={formData.spouse_name || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
                  placeholder="Spouse's name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wedding Anniversary</label>
                <input
                  type="text"
                  name="wedding_anniversary"
                  value={formData.wedding_anniversary || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
                  placeholder="e.g., 12/4"
                />
              </div>
            </>
          )}

          {/* Special Designations */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spiritual Name</label>
            <input
              type="text"
              name="spiritual_name"
              value={formData.spiritual_name || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
              placeholder="Vision/spiritual name"
            />
          </div>

          <div className="flex items-center gap-6 pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_vision_keeper"
                checked={formData.is_vision_keeper || false}
                onChange={handleChange}
                className="w-4 h-4 text-[#8B1538] rounded border-gray-300 focus:ring-[#8B1538]"
              />
              <span className="text-sm text-gray-700">Vision Keeper</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_full_time"
                checked={formData.is_full_time || false}
                onChange={handleChange}
                className="w-4 h-4 text-[#8B1538] rounded border-gray-300 focus:ring-[#8B1538]"
              />
              <span className="text-sm text-gray-700">Full-Time</span>
            </label>
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile</h3>
        <div className="space-y-4">
          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <textarea
              name="bio"
              value={formData.bio || ''}
              onChange={handleChange}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none resize-none"
              placeholder="Brief introduction..."
            />
          </div>

          {/* Spiritual Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spiritual Journey</label>
            <textarea
              name="spiritual_description"
              value={formData.spiritual_description || ''}
              onChange={handleChange}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none resize-none"
              placeholder="Share your spiritual journey..."
            />
          </div>

          {/* Prayer Needs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prayer Needs</label>
            <textarea
              name="prayer_needs"
              value={formData.prayer_needs || ''}
              onChange={handleChange}
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none resize-none"
              placeholder="How can we pray for you?"
            />
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
            <input
              type="text"
              name="emergency_contact_name"
              value={formData.emergency_contact_name || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
              placeholder="Emergency contact name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
            <input
              type="tel"
              name="emergency_contact_phone"
              value={formData.emergency_contact_phone || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
              placeholder="Emergency contact phone"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting || uploadingPhoto}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || uploadingPhoto}
          className="px-4 py-2 text-white bg-[#8B1538] rounded-lg hover:bg-[#6B0F2B] transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {(isSubmitting || uploadingPhoto) && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {member ? 'Update Member' : 'Create Member'}
        </button>
      </div>
    </form>
  )
}
