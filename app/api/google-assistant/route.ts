import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface GoogleAssistantRequest {
  handler?: { name: string }
  intent?: { name: string }
  session?: { id: string; params: Record<string, any> }
  prompt?: { firstSimple?: { speech: string; text: string } }
}

export async function POST(request: Request) {
  try {
    const body: GoogleAssistantRequest = await request.json()
    
    // Log for debugging
    console.log('Google Action request:', JSON.stringify(body, null, 2))

    const handler = body.handler?.name || body.intent?.name || 'unknown'
    const sessionParams = body.session?.params || {}

    // Handle different intents
    switch (handler) {
      case 'list_pantry':
      case 'ListPantryFulfillment':
        return handleListPantry()
      
      case 'add_item':
      case 'AddItemFulfillment':
        return handleAddItem(sessionParams)
      
      case 'remove_item':
      case 'RemoveItemFulfillment':
        return handleRemoveItem(sessionParams)
      
      case 'main':
      case 'MAIN':
        return handleMain()
      
      default:
        return handleMain()
    }
  } catch (error) {
    console.error('Error:', error)
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: "Sorry, something went wrong with Smart Pantry.",
          text: "Sorry, something went wrong. Try again."
        }
      }
    })
  }
}

function jsonResponse(response: any) {
  return NextResponse.json(response, {
    headers: { 'Content-Type': 'application/json' }
  })
}

function handleMain() {
  return jsonResponse({
    prompt: {
      firstSimple: {
        speech: "Welcome to Smart Pantry! You can ask me what's in your pantry, add items, or remove them. What would you like to do?",
        text: "Smart Pantry - Ask me what's in your pantry, add items, or remove them."
      },
      suggestions: [
        { title: "What's in my pantry?" },
        { title: "Add item" },
        { title: "Remove item" }
      ]
    }
  })
}

async function handleListPantry() {
  const { data: items, error } = await supabase
    .from('pantry')
    .select('*')
    .order('expiration_date', { ascending: true })
    .limit(10)

  if (error) {
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: "Sorry, I couldn't access your pantry right now.",
          text: "Error accessing pantry."
        }
      }
    })
  }

  if (!items || items.length === 0) {
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: "Your pantry is empty! Add some items to get started.",
          text: "Your pantry is empty."
        }
      }
    })
  }

  // Format for voice
  const itemList = items.map(i => `${i.quantity} ${i.name}`).join(', ')
  const soonExpiring = items.filter(i => {
    const days = getDaysUntilExpiry(i.expiration_date)
    return days <= 3
  })

  let speech = `You have ${items.length} items in your pantry: ${itemList}.`
  if (soonExpiring.length > 0) {
    const expiringNames = soonExpiring.map(i => i.name).join(', ')
    speech += ` Warning: ${expiringNames} are expiring soon!`
  }

  // Build rich response for touch display
  return jsonResponse({
    prompt: {
      firstSimple: {
        speech,
        text: `You have ${items.length} items.`
      },
      suggestions: [
        { title: "What's expiring soon?" },
        { title: "Add item" }
      ]
    },
    canvas: {
      state: true,
      json: {
        items: items.map(i => ({
          ...i,
          daysUntilExpiry: getDaysUntilExpiry(i.expiration_date)
        }))
      }
    }
  })
}

async function handleAddItem(params: Record<string, any>) {
  const name = params.item_name || params.name
  let quantity = parseInt(params.quantity) || 1
  let expiration_date = params.expiration_date || params.expiry
  
  // Parse relative dates
  if (!expiration_date) {
    const days = parseInt(params.days) || 7
    const future = new Date()
    future.setDate(future.getDate() + days)
    expiration_date = future.toISOString().split('T')[0]
  }

  if (!name) {
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: "What item would you like to add?",
          text: "What item would you like to add?"
        }
      }
    })
  }

  const { data, error } = await supabase
    .from('pantry')
    .insert({
      name,
      quantity,
      expiration_date,
      location: params.location || null
    })
    .select()
    .single()

  if (error) {
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: "Sorry, I couldn't add that item. Please try again.",
          text: "Failed to add item."
        }
      }
    })
  }

  return jsonResponse({
    prompt: {
      firstSimple: {
        speech: `Added ${quantity} ${name} to your pantry. It'll expire on ${expiration_date}.`,
        text: `Added ${name}.`
      }
    }
  })
}

async function handleRemoveItem(params: Record<string, any>) {
  const name = params.item_name || params.name

  if (!name) {
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: "Which item would you like to remove?",
          text: "Which item?"
        }
      }
    })
  }

  // Find the item
  const { data: items } = await supabase
    .from('pantry')
    .select('*')
    .ilike('name', `%${name}%`)
    .order('expiration_date', { ascending: true })
    .limit(1)

  if (!items || items.length === 0) {
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: `I couldn't find ${name} in your pantry.`,
          text: `Can't find ${name}.`
        }
      }
    })
  }

  const { error } = await supabase
    .from('pantry')
    .delete()
    .eq('id', items[0].id)

  if (error) {
    return jsonResponse({
      prompt: {
        firstSimple: {
          speech: "Sorry, I couldn't remove that item.",
          text: "Failed to remove item."
        }
      }
    })
  }

  return jsonResponse({
    prompt: {
      firstSimple: {
        speech: `Removed ${items[0].name} from your pantry.`,
        text: `Removed ${items[0].name}.`
      }
    }
  })
}

function getDaysUntilExpiry(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(dateStr + 'T00:00:00')
  return Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
