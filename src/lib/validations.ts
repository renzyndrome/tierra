import { z } from 'zod'

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

// Public service check-in form (guest flow). "Who invited you?" is optional and
// captured for follow-up / invitation tracking.
export const checkinFormSchema = z.object({
  name: z
    .string({ message: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .transform((val) => val.trim()),
  invitedBy: z
    .string()
    .max(100, 'Name is too long')
    .transform((val) => val.trim())
    .optional()
    .or(z.literal('')),
})

export type CheckinFormData = z.infer<typeof checkinFormSchema>
