'use client'
import { useState, useRef } from 'react'

type Msg = { role: string; content: string }

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const previewRef = useRef<HTMLDivElement | null>(null)

  async function fetchConversation() {
    if (!url) return alert('Please paste a share URL')
    setLoading(true)
    try {
      const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const txt = await res.text()
        alert('Fetch failed: ' + txt)
        setMessages([])
        return
      }
      const data = await res.json()
      if (data.error) {
        alert('Error: ' + data.error)
        setMessages([])
        return
      }
      setMessages(data.messages || [])
    } catch (err: any) {
      alert('Error fetching: ' + err.message)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  async function downloadPdf() {
    if (!previewRef.current) return
    // html2pdf.js is not ESM-friendly in all bundlers; use window global require pattern.
    const mod: any = await import('html2pdf.js')
    const html2pdf: any = mod?.default || mod
    const opt = {
      margin: 10,
      filename: 'conversation.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }
    if (typeof html2pdf !== 'function') {
      alert('PDF exporter failed to load. Please try again.')
      return
    }
    await html2pdf().from(previewRef.current).set(opt).save()
  }

  return (
    <div className="container">
      <h1 style={{fontSize:20,fontWeight:600,marginBottom:12}}>Chat Exporter</h1>
      <p style={{color:'#6b7280',marginBottom:12}}>Paste a public ChatGPT / Claude / Gemini share link and download the full conversation as a PDF. Mobile-friendly UI.</p>

      <div style={{marginBottom:12}}>
        <input
          style={{width:'100%',padding:10,borderRadius:8,border:'1px solid #e5e7eb'}}
          placeholder="Paste share link here"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={fetchConversation} disabled={loading}>{loading ? 'Fetching...' : 'Fetch & Preview'}</button>
          <button className="btn" onClick={() => { setUrl(''); setMessages([]) }}>Clear</button>
        </div>
      </div>

      <div>
        <div className="card" ref={previewRef}>
          {messages.length === 0 ? (
            <div style={{padding:8,color:'#374151'}}>No preview yet. Fetch a share link to see the conversation here.</div>
          ) : (
            <div>
              {messages.map((m, i) => (
                <div key={i} style={{display:'flex',gap:10,marginBottom:10,alignItems:'flex-start'}}>
                  <div style={{height:32,width:32,borderRadius:16,background:m.role.toLowerCase().includes('user')? '#a78bfa':'#d1fae5'}} />
                  <div>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{m.role}</div>
                    <div style={{fontSize:14,color:'#111827',whiteSpace:'pre-wrap'}}>{m.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{display:'flex',gap:8,marginTop:12}}>
        <button className="btn btn-primary" style={{flex:1}} onClick={downloadPdf}>Download PDF</button>
        <button className="btn" onClick={() => alert('Server-side PDF export coming soon')}>Server PDF</button>
      </div>

      <footer style={{marginTop:16,fontSize:12,color:'#6b7280'}}>Built with Next.js • Mobile-first • No storage by default</footer>
    </div>
  )
}
