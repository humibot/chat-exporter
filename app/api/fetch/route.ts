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
      // Try to extract markdown assistant blocks embedded as JSON strings like "### ..."
      const mdBlocks: string[] = []
      
      // Look through all script tags for next.js hydration payload
      for (const s of scriptNodes) {
        const txt = s.text || ''
        if (!txt) continue
        
        // Let's grab all occurrences of the text content inside the flight router response
        // ChatGPT encodes strings like "### \ud83d\udce6 What is **`react-helmet-async`**?..."
        const re = /"(#{1,6}[\s\S]*?)"/g
        let m
        while ((m = re.exec(txt)) !== null) {
          const raw = m[1]
          // Heuristic: keep blocks that look like markdown with headings or multiple newlines
          if (raw.includes('###') || raw.includes('\\n\\n') || raw.length > 100) {
            try {
              // Parse the JSON string properly to handle \n, \u003c, etc.
              // Also manually decode common unicode hex escapes if JSON.parse leaves them
              let parsed = JSON.parse(`"${raw}"`)
              // Unescape remaining things like \u003c to <
              parsed = parsed.replace(/\\u([0-9a-fA-F]{4})/g, (match: string, grp: string) => {
                 return String.fromCharCode(parseInt(grp, 16))
              })
              mdBlocks.push(parsed)
            } catch (e) {
              // Fallback if strict JSON parsing fails
              const unescaped = raw
                .replace(/\\n/g, '\n')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .replace(/\\u003c/g, '<')
                .replace(/\\u003e/g, '>')
              mdBlocks.push(unescaped)
            }
          }
        }
      }
      if (mdBlocks.length) {
        // Try to find a user prompt (simple heuristic: text with a question mark near the start)
        const userMatch = html.match(/\"([^"]{10,200}\?)\"/i)
        if (userMatch) {
          try {
             let parsedUser = JSON.parse(`"${userMatch[1]}"`)
             parsedUser = parsedUser.replace(/\\u([0-9a-fA-F]{4})/g, (match: string, grp: string) => {
                 return String.fromCharCode(parseInt(grp, 16))
             })
             messages.push({ role: 'user', content: parsedUser })
          } catch(e) {
             messages.push({ role: 'user', content: userMatch[1].replace(/\\n/g, '\n') })
          }
        }
        for (const b of mdBlocks) {
          messages.push({ role: 'assistant', content: b })
        }
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
