import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { registerAttendee } from '../server/functions/attendees'
import { getSatellites } from '../server/functions/satellites'
import { registrationSchema } from '../lib/validations'
import {
  DISCIPLESHIP_STAGES,
  EVENT_NAME,
  EVENT_TITLE,
  EVENT_DATES,
  EVENT_VENUE,
  LOGO_PATH,
  REGISTRATION_SUCCESS_MESSAGE,
} from '../lib/constants'
import type { DiscipleshipStage, SatelliteRecord } from '../lib/types'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [satellites, setSatellites] = useState<SatelliteRecord[]>([])

  // Form state
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [city, setCity] = useState('')
  const [satellite, setSatellite] = useState('')
  const [stage, setStage] = useState<DiscipleshipStage | ''>('')
  const [description, setDescription] = useState('')

  // Fetch satellites on mount
  useEffect(() => {
    const fetchSatellites = async () => {
      try {
        const data = await getSatellites({ data: false })
        setSatellites(data)
      } catch (error) {
        console.error('Failed to fetch satellites:', error)
      }
    }
    fetchSatellites()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    // Validate form data
    const formData = {
      name,
      age: parseInt(age, 10) || 0,
      city,
      satellite,
      discipleship_stage: stage as DiscipleshipStage,
      spiritual_description: description,
    }

    const result = registrationSchema.safeParse(formData)

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as string
        fieldErrors[field] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    setIsSubmitting(true)

    try {
      await registerAttendee({ data: result.data })
      setIsSuccess(true)
    } catch (error) {
      console.error('Registration failed:', error)
      setErrors({ form: 'Registration failed. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return <SuccessScreen />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E]">
      {/* Header with Logo */}
      <header className="pt-6 pb-4 px-4 text-center">
        <img
          src={LOGO_PATH}
          alt="NEXTLEVEL Stronger 2026"
          className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-4 rounded-full object-cover shadow-lg shadow-red-900/50"
        />
        <h1 className="text-xl md:text-2xl font-bold text-white mb-1">
          {EVENT_NAME}
        </h1>
        <p className="text-red-300 text-sm">{EVENT_TITLE}</p>
        <p className="text-red-400/70 text-xs mt-1">{EVENT_DATES} | {EVENT_VENUE}</p>
      </header>

      {/* Form Card */}
      <main className="px-4 pb-8">
        <form
          onSubmit={handleSubmit}
          className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl shadow-red-900/30 p-6 md:p-8"
        >
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
            Registration Form
          </h2>

          {errors.form && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {errors.form}
            </div>
          )}

          {/* Name */}
          <div className="mb-4">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              } focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="Juan dela Cruz"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Age */}
          <div className="mb-4">
            <label
              htmlFor="age"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Age
            </label>
            <input
              type="number"
              id="age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min="1"
              max="99"
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.age ? 'border-red-500' : 'border-gray-300'
              } focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="25"
            />
            {errors.age && (
              <p className="mt-1 text-sm text-red-500">{errors.age}</p>
            )}
          </div>

          {/* City */}
          <div className="mb-4">
            <label
              htmlFor="city"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              City/Municipality
            </label>
            <input
              type="text"
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.city ? 'border-red-500' : 'border-gray-300'
              } focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="Santa Rosa"
            />
            {errors.city && (
              <p className="mt-1 text-sm text-red-500">{errors.city}</p>
            )}
          </div>

          {/* Satellite */}
          <div className="mb-4">
            <label
              htmlFor="satellite"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Satellite Location
            </label>
            <select
              id="satellite"
              value={satellite}
              onChange={(e) => setSatellite(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.satellite ? 'border-red-500' : 'border-gray-300'
              } focus:ring-2 focus:ring-red-500 focus:border-transparent transition bg-white appearance-none cursor-pointer`}
            >
              <option value="">Select your satellite</option>
              {satellites.map((sat) => (
                <option key={sat.id} value={sat.name}>
                  {sat.name}
                </option>
              ))}
            </select>
            {errors.satellite && (
              <p className="mt-1 text-sm text-red-500">{errors.satellite}</p>
            )}
          </div>

          {/* Discipleship Stage */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Discipleship Stage
            </label>
            <div className="space-y-2">
              {DISCIPLESHIP_STAGES.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-start p-3 rounded-lg border cursor-pointer transition ${
                    stage === s.value
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="stage"
                    value={s.value}
                    checked={stage === s.value}
                    onChange={(e) =>
                      setStage(e.target.value as DiscipleshipStage)
                    }
                    className="sr-only"
                  />
                  <span
                    className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                      stage === s.value
                        ? 'border-red-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {stage === s.value && (
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                    )}
                  </span>
                  <div>
                    <span className="text-gray-700 font-medium">{s.label}</span>
                    <p className="text-sm text-gray-500">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {errors.discipleship_stage && (
              <p className="mt-1 text-sm text-red-500">
                {errors.discipleship_stage}
              </p>
            )}
          </div>

          {/* Spiritual Description */}
          <div className="mb-6">
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Share your spiritual journey
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Tell us about where you are in your faith walk. This helps us
              connect you with the right community.
            </p>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={500}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.spiritual_description
                  ? 'border-red-500'
                  : 'border-gray-300'
              } focus:ring-2 focus:ring-red-500 focus:border-transparent transition resize-none`}
              placeholder="I've been attending church for 2 years and I'm excited to grow more in my faith..."
            />
            <div className="flex justify-between mt-1">
              {errors.spiritual_description ? (
                <p className="text-sm text-red-500">
                  {errors.spiritual_description}
                </p>
              ) : (
                <span />
              )}
              <span className="text-xs text-gray-400">
                {description.length}/500
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 rounded-lg font-semibold text-white transition ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#8B1538] to-[#B91C3C] hover:from-[#6B0F2B] hover:to-[#8B1538] active:from-[#5A0C24] active:to-[#6B0F2B]'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Registering...
              </span>
            ) : (
              'Register Now'
            )}
          </button>
        </form>
      </main>
    </div>
  )
}

function SuccessScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#B91C3C] to-[#6B0F2B] flex items-center justify-center p-4">
      <div className="text-center">
        {/* Logo */}
        <img
          src={LOGO_PATH}
          alt="NEXTLEVEL Stronger 2026"
          className="w-32 h-32 mx-auto mb-6 rounded-full object-cover shadow-lg shadow-black/30"
        />

        {/* Success Message */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          You're Registered!
        </h1>

        <p className="text-xl text-red-100 max-w-md mx-auto mb-8">
          {REGISTRATION_SUCCESS_MESSAGE}
        </p>

        {/* Event Badge */}
        <div className="inline-block bg-white/20 backdrop-blur-sm rounded-full px-6 py-3">
          <span className="text-white font-semibold">{EVENT_NAME}</span>
        </div>

        {/* Event Details */}
        <p className="text-red-200 text-sm mt-4">{EVENT_DATES}</p>
        <p className="text-red-300/70 text-xs">{EVENT_VENUE}</p>
      </div>
    </div>
  )
}
