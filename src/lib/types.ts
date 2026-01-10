// Supabase Database Types
export type Database = {
  public: {
    Tables: {
      satellites: {
        Row: {
          id: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          created_at?: string
        }
      }
      attendees: {
        Row: {
          id: string
          name: string
          age: number
          city: string
          satellite: Satellite
          discipleship_stage: DiscipleshipStage
          spiritual_description: string
          spiritual_score: number | null
          spiritual_sentiment: SpiritualSentiment | null
          needs_support: boolean
          registered_at: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          age: number
          city: string
          satellite: Satellite
          discipleship_stage: DiscipleshipStage
          spiritual_description: string
          spiritual_score?: number | null
          spiritual_sentiment?: SpiritualSentiment | null
          needs_support?: boolean
          registered_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          age?: number
          city?: string
          satellite?: Satellite
          discipleship_stage?: DiscipleshipStage
          spiritual_description?: string
          spiritual_score?: number | null
          spiritual_sentiment?: SpiritualSentiment | null
          needs_support?: boolean
          registered_at?: string
          created_at?: string
        }
      }
    }
  }
}

// Enum types (Satellite is now dynamic, but we keep this for type compatibility)
export type Satellite = string

// Satellite row type
export type SatelliteRecord = Database['public']['Tables']['satellites']['Row']

// Fun fact row type
export interface FunFactRecord {
  id: string
  content: string
  is_active: boolean
  created_at: string
}

export type DiscipleshipStage = 'Newbie' | 'Growing' | 'Leader'

export type SpiritualSentiment = 'struggling' | 'stable' | 'thriving'

// Attendee type shorthand
export type Attendee = Database['public']['Tables']['attendees']['Row']
export type AttendeeInsert = Database['public']['Tables']['attendees']['Insert']
export type AttendeeUpdate = Database['public']['Tables']['attendees']['Update']

// Dashboard stats types
export interface DashboardStats {
  total: number
  bySatellite: Record<Satellite, number>
  byStage: Record<DiscipleshipStage, number>
  earlyBirdCount: number
  averageAge: number
  needsSupportCount: number
}

export interface AgeDistribution {
  bucket: string
  count: number
}

export interface RegistrationTimeline {
  hour: string
  count: number
}

// AI Analysis types
export interface SpiritualAnalysis {
  spiritual_score: number
  spiritual_sentiment: SpiritualSentiment
  needs_support: boolean
  key_themes: string[]
}

// Mentor match types
export interface MentorMatch {
  mentor: Attendee
  score: number
  reasons: string[]
}

// Overall AI Insights (generated from single API call)
export interface OverallInsights {
  summary: string
  overallSentiment: SpiritualSentiment
  keyThemes: string[]
  strengthAreas: string[]
  concernAreas: string[]
  actionItems: string[]
  mentorshipSuggestions: MentorshipSuggestion[]
  generatedAt: string
  // Actual data from database (not AI generated)
  stats: {
    totalAttendees: number
    newbies: { name: string; satellite: string }[]
    leaders: { name: string; satellite: string }[]
    satelliteRanking: { satellite: string; count: number }[]
  }
}

export interface MentorshipSuggestion {
  newbie: string
  suggestedMentor: string
  reason: string
}
