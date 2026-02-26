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
      const strRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let match;
      while ((match = strRegex.exec(html)) !== null) {
        let text = match[1];
        if (text.startsWith('[{\\"') && (text.includes('message') || text.includes('parts'))) {
          try {
            let parsedStr = JSON.parse(`"${text}"`);
            let arr = JSON.parse(parsedStr);
            arr.forEach((item: any) => {
              if (typeof item === 'string') {
                if (item.includes('<!DOCTYPE html>') || item.startsWith('https://')) return;
                // Detect Assistant text (usually long and has formatting)
                if (item.includes('###') || item.includes('\\n\\n') || item.includes('\n\n') || item.length > 200) {
                  messages.push({ role: 'assistant', content: item });
                }
                // Detect User text
                else if (item.length > 5 && item.length < 500 && !item.includes('_') && item.includes(' ') && !item.startsWith('http')) {
                   const blacklist = ['React Helmet Async Explained', 'Our latest and most advanced model', 'Shared via ChatGPT', 'ChatGPT', 'Copy code'];
                   let isBlacklisted = false;
                   for (const b of blacklist) {
                     if (item.includes(b)) isBlacklisted = true;
                   }
                   
                   if (!isBlacklisted && !item.endsWith('.png')) {
                       if (/[a-zA-Z]/.test(item)) {
                          // It passed the filters, it's a prompt
                          messages.push({ role: 'user', content: item });
                       }
                   }
                }              }
            });
          } catch (e) {}
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
