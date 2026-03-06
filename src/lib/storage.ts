// Quest Laguna Directory - Storage Utilities

import { supabase } from './supabase'

const BUCKET_NAME = 'media'
const MEMBER_PHOTOS_FOLDER = 'member-photos'
const EVENT_BANNERS_FOLDER = 'event-banners'
const RECEIPTS_FOLDER = 'receipts'
const MINISTRY_PHOTOS_FOLDER = 'ministry-photos'

// ============================================
// UPLOAD MEMBER PHOTO
// ============================================

export async function uploadMemberPhoto(
  memberId: string,
  file: File
): Promise<{ url: string; error: Error | null }> {
  try {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return {
        url: '',
        error: new Error('Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.'),
      }
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return {
        url: '',
        error: new Error('File too large. Maximum size is 5MB.'),
      }
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${memberId}-${Date.now()}.${fileExt}`
    const filePath = `${MEMBER_PHOTOS_FOLDER}/${fileName}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return {
        url: '',
        error: new Error('Failed to upload photo. Please try again.'),
      }
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    return {
      url: publicUrl,
      error: null,
    }
  } catch (err) {
    console.error('Upload error:', err)
    return {
      url: '',
      error: err as Error,
    }
  }
}

// ============================================
// UPLOAD EVENT BANNER
// ============================================

export async function uploadEventBanner(
  eventId: string,
  file: File
): Promise<{ url: string; error: Error | null }> {
  try {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return { url: '', error: new Error('Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.') }
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return { url: '', error: new Error('File too large. Maximum size is 5MB.') }
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${eventId}-${Date.now()}.${fileExt}`
    const filePath = `${EVENT_BANNERS_FOLDER}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { cacheControl: '3600', upsert: true })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return { url: '', error: new Error('Failed to upload banner. Please try again.') }
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    return { url: publicUrl, error: null }
  } catch (err) {
    console.error('Upload error:', err)
    return { url: '', error: err as Error }
  }
}

// ============================================
// UPLOAD FINANCIAL RECEIPT
// ============================================

export async function uploadReceipt(
  file: File
): Promise<{ url: string; error: Error | null }> {
  try {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return { url: '', error: new Error('Invalid file type. Please upload a JPEG, PNG, WebP, GIF, or PDF.') }
    }

    const maxSize = 10 * 1024 * 1024 // 10MB for receipts
    if (file.size > maxSize) {
      return { url: '', error: new Error('File too large. Maximum size is 10MB.') }
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${fileExt}`
    const filePath = `${RECEIPTS_FOLDER}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    if (uploadError) {
      console.error('Receipt upload error:', uploadError)
      return { url: '', error: new Error('Failed to upload receipt. Please try again.') }
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    return { url: publicUrl, error: null }
  } catch (err) {
    console.error('Receipt upload error:', err)
    return { url: '', error: err as Error }
  }
}

// ============================================
// UPLOAD MINISTRY PHOTO
// ============================================

export async function uploadMinistryPhoto(
  ministryId: string,
  file: File
): Promise<{ url: string; error: Error | null }> {
  try {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return { url: '', error: new Error('Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.') }
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return { url: '', error: new Error('File too large. Maximum size is 5MB.') }
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${ministryId}-${Date.now()}.${fileExt}`
    const filePath = `${MINISTRY_PHOTOS_FOLDER}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { cacheControl: '3600', upsert: true })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return { url: '', error: new Error('Failed to upload photo. Please try again.') }
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    return { url: publicUrl, error: null }
  } catch (err) {
    console.error('Upload error:', err)
    return { url: '', error: err as Error }
  }
}

// ============================================
// DELETE MEMBER PHOTO
// ============================================

export async function deleteMemberPhoto(photoUrl: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Extract file path from URL
    const urlParts = photoUrl.split(`${BUCKET_NAME}/`)
    if (urlParts.length < 2) {
      return {
        success: false,
        error: new Error('Invalid photo URL'),
      }
    }

    const filePath = urlParts[1]

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath])

    if (error) {
      console.error('Delete error:', error)
      return {
        success: false,
        error: new Error('Failed to delete photo'),
      }
    }

    return {
      success: true,
      error: null,
    }
  } catch (err) {
    console.error('Delete error:', err)
    return {
      success: false,
      error: err as Error,
    }
  }
}

// ============================================
// GET PHOTO URL FROM PATH
// ============================================

export function getPhotoUrl(path: string): string {
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path)

  return publicUrl
}

// ============================================
// GENERATE PLACEHOLDER AVATAR
// ============================================

export function getPlaceholderAvatar(name: string): string {
  // Use UI Avatars service for placeholder
  const initials = name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=8B1538&color=fff&size=200`
}
