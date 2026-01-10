import { z } from 'zod'

export const registrationSchema = z.object({
  name: z
    .string({ message: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .transform((val) => val.trim()),
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
  discipleship_stage: z.enum(['Newbie', 'Growing', 'Leader'], {
    message: 'Please select your discipleship stage',
  }),
  spiritual_description: z
    .string({ message: 'Spiritual description is required' })
    .min(10, 'Please share at least 10 characters about your spiritual journey')
    .max(500, 'Please keep your description under 500 characters')
    .transform((val) => val.trim()),
})

export type RegistrationFormData = z.infer<typeof registrationSchema>
