import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { z } from 'zod'
import type { SpiritualAnalysis, Attendee, OverallInsights } from '../../lib/types'

// Server-side Supabase client
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, key)
}

// Get OpenAI client
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable')
  }

  return new OpenAI({ apiKey })
}

// Analyze a single spiritual description
// OPTIMIZED: Minimal prompt to reduce token usage (~80% reduction)
export async function analyzeSpiritualDescription(
  description: string,
  discipleshipStage: string
): Promise<SpiritualAnalysis> {
  const openai = getOpenAI()

  // Ultra-compact prompt - saves tokens significantly
  const prompt = `Analyze church attendee (${discipleshipStage}): "${description}"
Return JSON: {"spiritual_score":1-10,"spiritual_sentiment":"struggling|stable|thriving","needs_support":bool,"key_themes":["theme1","theme2"]}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 100, // Limit output tokens
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  const analysis = JSON.parse(content) as SpiritualAnalysis
  return analysis
}

// Analyze a single attendee by ID
const analyzeAttendeeSchema = z.object({
  attendeeId: z.string().uuid(),
  pin: z.string(),
})

export const analyzeAttendee = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof analyzeAttendeeSchema>) => analyzeAttendeeSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    // Get the attendee
    const { data: attendee, error: fetchError } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', data.attendeeId)
      .single()

    if (fetchError || !attendee) {
      throw new Error('Attendee not found')
    }

    const typedAttendee = attendee as Attendee

    // Analyze the description
    const analysis = await analyzeSpiritualDescription(
      typedAttendee.spiritual_description,
      typedAttendee.discipleship_stage
    )

    // Update the attendee with AI analysis
    const { data: updated, error: updateError } = await supabase
      .from('attendees')
      .update({
        spiritual_score: analysis.spiritual_score,
        spiritual_sentiment: analysis.spiritual_sentiment,
        needs_support: analysis.needs_support,
      })
      .eq('id', data.attendeeId)
      .select()
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      throw new Error('Failed to update attendee with analysis')
    }

    return {
      attendee: updated as Attendee,
      analysis,
    }
  })

// Bulk analyze all unanalyzed attendees
const bulkAnalyzeSchema = z.object({
  pin: z.string(),
  limit: z.number().min(1).max(50).default(10),
})

export const bulkAnalyzeAttendees = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof bulkAnalyzeSchema>) => bulkAnalyzeSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    // Get unanalyzed attendees (where spiritual_score is null)
    const { data: attendees, error: fetchError } = await supabase
      .from('attendees')
      .select('*')
      .is('spiritual_score', null)
      .order('registered_at', { ascending: false })
      .limit(data.limit)

    if (fetchError) {
      console.error('Fetch error:', fetchError)
      throw new Error('Failed to fetch attendees')
    }

    if (!attendees || attendees.length === 0) {
      return { analyzed: 0, message: 'No unanalyzed attendees found' }
    }

    const results: { id: string; success: boolean; error?: string }[] = []

    // Process each attendee
    for (const attendee of attendees) {
      const typedAttendee = attendee as Attendee
      try {
        const analysis = await analyzeSpiritualDescription(
          typedAttendee.spiritual_description,
          typedAttendee.discipleship_stage
        )

        await supabase
          .from('attendees')
          .update({
            spiritual_score: analysis.spiritual_score,
            spiritual_sentiment: analysis.spiritual_sentiment,
            needs_support: analysis.needs_support,
          })
          .eq('id', typedAttendee.id)

        results.push({ id: typedAttendee.id, success: true })
      } catch (error) {
        console.error(`Error analyzing ${typedAttendee.id}:`, error)
        results.push({
          id: typedAttendee.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Delay between requests to avoid rate limiting and spread costs
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const successCount = results.filter((r) => r.success).length
    return {
      analyzed: successCount,
      failed: results.length - successCount,
      results,
    }
  })

// Get AI insights summary for dashboard
export const getAIInsights = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabase()

  // Get all analyzed attendees
  const { data: attendees, error } = await supabase
    .from('attendees')
    .select('spiritual_score, spiritual_sentiment, needs_support, discipleship_stage')
    .not('spiritual_score', 'is', null)

  if (error || !attendees) {
    return {
      totalAnalyzed: 0,
      averageScore: 0,
      sentimentBreakdown: { struggling: 0, stable: 0, thriving: 0 },
      needsSupportCount: 0,
      scoreByStage: { Newbie: 0, Growing: 0, Leader: 0 },
    }
  }

  const analyzed = attendees as {
    spiritual_score: number
    spiritual_sentiment: string
    needs_support: boolean
    discipleship_stage: string
  }[]

  // Calculate insights
  const totalAnalyzed = analyzed.length
  const averageScore =
    totalAnalyzed > 0
      ? Math.round((analyzed.reduce((sum, a) => sum + a.spiritual_score, 0) / totalAnalyzed) * 10) / 10
      : 0

  const sentimentBreakdown = {
    struggling: analyzed.filter((a) => a.spiritual_sentiment === 'struggling').length,
    stable: analyzed.filter((a) => a.spiritual_sentiment === 'stable').length,
    thriving: analyzed.filter((a) => a.spiritual_sentiment === 'thriving').length,
  }

  const needsSupportCount = analyzed.filter((a) => a.needs_support).length

  // Calculate average score by discipleship stage
  const stageGroups = {
    Newbie: analyzed.filter((a) => a.discipleship_stage === 'Newbie'),
    Growing: analyzed.filter((a) => a.discipleship_stage === 'Growing'),
    Leader: analyzed.filter((a) => a.discipleship_stage === 'Leader'),
  }

  const scoreByStage = {
    Newbie:
      stageGroups.Newbie.length > 0
        ? Math.round(
            (stageGroups.Newbie.reduce((sum, a) => sum + a.spiritual_score, 0) / stageGroups.Newbie.length) * 10
          ) / 10
        : 0,
    Growing:
      stageGroups.Growing.length > 0
        ? Math.round(
            (stageGroups.Growing.reduce((sum, a) => sum + a.spiritual_score, 0) / stageGroups.Growing.length) * 10
          ) / 10
        : 0,
    Leader:
      stageGroups.Leader.length > 0
        ? Math.round(
            (stageGroups.Leader.reduce((sum, a) => sum + a.spiritual_score, 0) / stageGroups.Leader.length) * 10
          ) / 10
        : 0,
  }

  return {
    totalAnalyzed,
    averageScore,
    sentimentBreakdown,
    needsSupportCount,
    scoreByStage,
  }
})

// Get attendees who need support
export const getAttendeesNeedingSupport = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .eq('needs_support', true)
    .order('spiritual_score', { ascending: true })

  if (error) {
    console.error('Error fetching support list:', error)
    return []
  }

  return data as Attendee[]
})

// Generate overall insights from ALL attendees in a single API call
// Returns actual data + AI-generated suggestions for leaders/mentors/admins
const generateOverallSchema = z.object({
  pin: z.string(),
})

export const generateOverallInsights = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof generateOverallSchema>) => generateOverallSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()
    const openai = getOpenAI()

    // Get ALL attendees
    const { data: attendees, error } = await supabase
      .from('attendees')
      .select('name, age, satellite, discipleship_stage, spiritual_description')
      .order('registered_at', { ascending: false })

    if (error || !attendees || attendees.length === 0) {
      throw new Error('No attendees found to analyze')
    }

    // Extract actual data from database
    const newbies = attendees
      .filter((a) => a.discipleship_stage === 'Newbie')
      .map((a) => ({ name: a.name, satellite: a.satellite }))

    const leaders = attendees
      .filter((a) => a.discipleship_stage === 'Leader')
      .map((a) => ({ name: a.name, satellite: a.satellite }))

    // Calculate satellite ranking
    const satelliteCounts: Record<string, number> = {}
    attendees.forEach((a) => {
      satelliteCounts[a.satellite] = (satelliteCounts[a.satellite] || 0) + 1
    })
    const satelliteRanking = Object.entries(satelliteCounts)
      .map(([satellite, count]) => ({ satellite, count }))
      .sort((a, b) => b.count - a.count)

    // Sample spiritual descriptions with names for mentorship matching
    const newbieDescriptions = attendees
      .filter((a) => a.discipleship_stage === 'Newbie')
      .slice(0, 15)
      .map((a) => `${a.name}: "${a.spiritual_description.slice(0, 80)}"`)
      .join('\n')

    const leaderDescriptions = attendees
      .filter((a) => a.discipleship_stage === 'Leader')
      .slice(0, 10)
      .map((a) => `${a.name}: "${a.spiritual_description.slice(0, 80)}"`)
      .join('\n')

    // Helper to infer gender from Filipino first name
    const maleNames = ['Juan', 'Jose', 'Pedro', 'Carlos', 'Miguel', 'Antonio', 'Francisco', 'Rafael', 'Manuel', 'Luis', 'Fernando', 'Roberto', 'David', 'Daniel', 'Pablo', 'Marco', 'Andres', 'Ricardo', 'Eduardo', 'Gabriel']
    const femaleNames = ['Maria', 'Ana', 'Rosa', 'Elena', 'Sofia', 'Isabella', 'Lucia', 'Gabriela', 'Patricia', 'Carmen', 'Angela', 'Teresa', 'Cristina', 'Victoria', 'Andrea', 'Camila', 'Valentina', 'Beatriz', 'Claudia', 'Diana']

    const inferGender = (name: string): 'M' | 'F' | 'U' => {
      const firstName = name.split(' ')[0]
      if (maleNames.includes(firstName)) return 'M'
      if (femaleNames.includes(firstName)) return 'F'
      return 'U' // Unknown
    }

    // Build compact data for AI prompt with gender info
    const newbieNamesWithGender = newbies.slice(0, 10).map((n) => `${n.name}[${inferGender(n.name)}] (${n.satellite.replace('Quest ', '')})`).join(', ')
    const leaderNamesWithGender = leaders.slice(0, 10).map((l) => `${l.name}[${inferGender(l.name)}] (${l.satellite.replace('Quest ', '')})`).join(', ')

    // AI prompt for actionable insights
    const prompt = `Church event: ${attendees.length} attendees. Top satellite: ${satelliteRanking[0]?.satellite} (${satelliteRanking[0]?.count}).

Newbies (${newbies.length}): ${newbieNamesWithGender}
Leaders (${leaders.length}): ${leaderNamesWithGender}

Note: [M]=Male, [F]=Female. IMPORTANT: Only suggest same-gender mentorship matches (male mentor for male newbie, female mentor for female newbie).

Newbie descriptions:
${newbieDescriptions}

Leader descriptions:
${leaderDescriptions}

Return JSON with actionable insights for church leaders/mentors:
{"summary":"2-3 sentences","overallSentiment":"struggling|stable|thriving","keyThemes":["theme1","theme2"],"strengthAreas":["strength1"],"concernAreas":["concern1"],"actionItems":["specific action for leaders"],"mentorshipSuggestions":[{"newbie":"name","suggestedMentor":"leader name","reason":"why good match"}]}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const aiAnalysis = JSON.parse(content)

    return {
      summary: aiAnalysis.summary || '',
      overallSentiment: aiAnalysis.overallSentiment || 'stable',
      keyThemes: aiAnalysis.keyThemes || [],
      strengthAreas: aiAnalysis.strengthAreas || [],
      concernAreas: aiAnalysis.concernAreas || [],
      actionItems: aiAnalysis.actionItems || [],
      mentorshipSuggestions: aiAnalysis.mentorshipSuggestions || [],
      generatedAt: new Date().toISOString(),
      stats: {
        totalAttendees: attendees.length,
        newbies,
        leaders,
        satelliteRanking,
      },
    } as OverallInsights
  })
