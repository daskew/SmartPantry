import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Admin client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const expiring = searchParams.get('expiring') // days (e.g. "7")
    const limit = searchParams.get('limit') || '50'
    
    let query = supabase
      .from('pantry')
      .select('*')
      .order('expiration_date', { ascending: true })
      .limit(parseInt(limit))

    // If filtering by expiring soon
    if (expiring) {
      const today = new Date()
      const futureDate = new Date()
      futureDate.setDate(today.getDate() + parseInt(expiring))
      
      query = supabase
        .from('pantry')
        .select('*')
        .gte('expiration_date', today.toISOString().split('T')[0])
        .lte('expiration_date', futureDate.toISOString().split('T')[0])
        .order('expiration_date', { ascending: true })
        .limit(parseInt(limit))
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ items: data || [] })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, quantity, expiration_date, location } = body

    if (!name || !expiration_date) {
      return NextResponse.json(
        { error: 'Missing required fields: name, expiration_date' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('pantry')
      .insert({
        name,
        quantity: quantity || 1,
        expiration_date,
        location: location || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ item: data, message: 'Item added successfully' })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
