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
