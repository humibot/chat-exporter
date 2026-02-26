import { NextResponse } from 'next/server'
import { parse } from 'node-html-parser'

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s)
  } catch (e) {
    return null
  }
}

function findMessagesInObject(obj: any) {
  const queue = [obj]
  while (queue.length) {
    const node = queue.shift()
    if (!node) continue
    if (Array.isArray(node)) {
      if (node.length && node[0] && typeof node[0] === 'object' && (node[0].content || node[0].text || node[0].role)) {
        return node
      }
      node.forEach((c: any) => queue.push(c))
    } else if (typeof node === 'object') {
      Object.keys(node).forEach(k => queue.push(node[k]))
    }
  }
  return null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 })

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Chat-Exporter/1.0)' } })
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch URL', status: res.status }, { status: 502 })
    const html = await res.text()

    const root = parse(html)
    const scriptNodes = root.querySelectorAll('script')
    let messages: any[] = []

    // Provider-specific heuristic for ChatGPT share links
    if (url.includes('chatgpt.com/share')) {
      const messagesFound: any[] = []
      
      // Look through all script tags for the Next.js Flight Router payload
      for (const s of scriptNodes) {
        const txt = s.text || ''
        if (!txt) continue
        
        // Match the enqueue payload which contains the chat data
        const enqueueMatch = txt.match(/enqueue\(\"([\s\S]*?)\"\)/)
        if (enqueueMatch) {
          try {
            // The payload is a JavaScript string literal. Parse it to unescape \", \\n, etc.
            const unescapedString = JSON.parse(`"${enqueueMatch[1]}"`)
            // The unescaped string is a JSON array
            const data = JSON.parse(unescapedString)
            
            // Recursively find all strings in the JSON structure
            const findStrings = (obj: any): string[] => {
              let strings: string[] = []
              if (typeof obj === 'string') {
                strings.push(obj)
              } else if (Array.isArray(obj)) {
                for (let item of obj) strings.push(...findStrings(item))
              } else if (obj !== null && typeof obj === 'object') {
                for (let key in obj) strings.push(...findStrings(obj[key]))
              }
              return strings
            }
            
            const allStrings = findStrings(data)
            
            // Heuristic to separate User and Assistant messages based on string content
            for (const str of allStrings) {
              if (str.length < 10) continue
              // Skip internal React/Next.js strings
              if (str.includes('react-router') || str.includes('__NEXT_DATA__') || str.includes('<!DOCTYPE')) continue
              
              // Assistant messages usually contain markdown headers or multiple newlines
              if (str.includes('###') || str.includes('\n\n') || str.includes('```')) {
                // Prevent duplicates
                if (!messagesFound.some(m => m.content === str)) {
                  messagesFound.push({ role: 'assistant', content: str })
                }
              } 
              // User messages usually end in ? or are short unformatted text
              else if (str.trim().endsWith('?') || str.length > 20) {
                 // Prevent duplicates and avoid grabbing random JSON keys
                 if (!messagesFound.some(m => m.content === str) && !str.includes('{"') && !str.match(/^[a-z_A-Z0-9]+$/)) {
                    // Try to avoid false positives by checking if it's already caught
                    messagesFound.push({ role: 'user', content: str })
                 }
              }
            }
          } catch (e) {
            console.error('Failed to parse enqueue payload', e)
          }
        }
      }
      
      if (messagesFound.length > 0) {
         // Sort to put user messages first (simple heuristic)
         messagesFound.sort((a, b) => a.role === 'user' ? -1 : 1)
         
         // In many cases, we might grab too many strings. 
         // For a simple conversation, we can just take the longest assistant message 
         // and the longest user message to avoid noise.
         const userMsgs = messagesFound.filter(m => m.role === 'user').sort((a,b) => b.content.length - a.content.length)
         const asstMsgs = messagesFound.filter(m => m.role === 'assistant').sort((a,b) => b.content.length - a.content.length)
         
         messages = []
         if (userMsgs.length > 0) messages.push(userMsgs[0])
         if (asstMsgs.length > 0) messages.push(asstMsgs[0])
      }
    }

    if (!messages.length) {
      for (const s of scriptNodes) {
        const txt = s.text || ''
        if (!txt) continue
        // Try to parse the entire script content as JSON
        const maybe = safeJsonParse(txt)
        if (maybe) {
          const found = findMessagesInObject(maybe)
          if (found) {
            messages = found
            break
          }
        }
        // Try to extract a JSON substring that contains "messages"
        const m = txt.match(/"messages"\s*:\s*(\[.*\])/s)
        if (m && m[1]) {
          const parsed = safeJsonParse(m[1])
          if (Array.isArray(parsed)) {
            messages = parsed
            break
          }
        }
      }

      // Fallback: extract visible paragraphs from likely containers
      if (!messages.length) {
        const nodes = root.querySelectorAll('article p, .markdown p, .chat-message, .message, .prose p')
        if (nodes.length) {
          nodes.forEach((el) => {
            const text = el.text.trim()
            if (text) messages.push({ role: 'unknown', content: text })
          })
        }
      }

      // Final fallback: body text
      if (!messages.length) {
        const bodyText = root.textContent.trim().replace(/\s+/g, ' ')
        if (bodyText) messages.push({ role: 'unknown', content: bodyText.slice(0, 10000) })
      }
    }

    const normalized = messages.map((m: any) => {
      if (!m) return null
      const role = (m.role || m.from || m.author || m.sender || (m.user ? 'user' : undefined) || 'unknown')
      const content = (m.content || m.text || (m.message ? (typeof m.message === 'string' ? m.message : m.message.content) : null) || m.body || m.value || '')
      return { role: String(role), content: String(content) }
    }).filter(Boolean)

    return NextResponse.json({ source: url, messages: normalized.slice(0, 1000) })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
