import { z } from 'zod'

export const registrationSchema = z.object({
  name: z
    .string({ message: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .transform((val) => val.trim()),
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(200)
    .transform((val) => val.trim().toLowerCase())
    .optional()
    .or(z.literal('')),
  contact_number: z
    .string()
    .max(20, 'Contact number is too long')
    .transform((val) => val.trim())
    .optional()
    .or(z.literal('')),
  age: z
    .number({ message: 'Age must be a number' })
    .int('Age must be a whole number')
    .min(1, 'Age must be at least 1')
    .max(99, 'Age must be less than 100'),
  city: z
    .string({ message: 'City is required' })
    .min(2, 'City must be at least 2 characters')
    .max(50, 'City must be less than 50 characters')
    .transform((val) => val.trim()),
  satellite: z
    .string({ message: 'Please select a satellite' })
    .min(1, 'Please select a satellite'),
  member_status: z.enum(['First Timer', 'Newbie', 'Regular', 'Leader'], {
    message: 'Please select your member status',
  }),
  invited_by: z
    .string()
    .max(100, 'Name is too long')
    .transform((val) => val.trim())
    .optional()
    .or(z.literal('')),
  event_id: z.string().uuid().optional(),
})

export type RegistrationFormData = z.infer<typeof registrationSchema>
