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

// Financial transaction validation
export const financialTransactionSchema = z.object({
  transaction_date: z.string().min(1, 'Date is required'),
  transaction_type: z.enum(['income', 'expense'], { message: 'Select transaction type' }),
  category: z.string().min(1, 'Category is required'),
  amount: z
    .number({ message: 'Amount is required' })
    .positive('Amount must be greater than 0')
    .max(99999999.99, 'Amount is too large'),
  description: z.string().max(500).optional().nullable(),
  reference_number: z.string().max(100).optional().nullable(),
  satellite_id: z.string().uuid('Select a satellite'),
  member_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

export type FinancialTransactionFormData = z.infer<typeof financialTransactionSchema>
