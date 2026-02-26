'use client'
import { useState, useRef } from 'react'
import { Download, Link as LinkIcon, RefreshCw, Trash2, CheckCircle2, FileText, Smartphone } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
    if (!url) return alert('No URL to export')
    
    // Fallback logic: 
    // We try the Puppeteer high-fidelity export first.
    // If Vercel times out or fails (due to binary limits), we fallback to client-side printing
    setLoading(true)
    try {
      const response = await fetch(`/api/export-pdf?url=${encodeURIComponent(url)}`)
      
      if (!response.ok) {
        // Fallback to client print
        throw new Error('Server PDF failed, falling back to client print.')
      }

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = 'chat-export.pdf'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(downloadUrl)
      document.body.removeChild(a)

    } catch (err: any) {
      console.warn('Falling back to native print due to:', err.message)
      // Fallback: trigger native print dialog
      window.print()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="w-full max-w-3xl mb-8 text-center space-y-4 print:hidden">
        <div className="inline-flex items-center justify-center p-3 bg-blue-100 rounded-full mb-2 shadow-sm">
          <FileText className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Chat Exporter</h1>
        <p className="text-base text-slate-600 max-w-xl mx-auto">
          Turn any public ChatGPT, Claude, or Gemini share link into a clean, readable PDF document instantly. Mobile-friendly and fast.
        </p>
      </div>

      {/* Input Section */}
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 mb-8 transition-all hover:shadow-md print:hidden">
        <label htmlFor="url-input" className="block text-sm font-medium text-slate-700 mb-2">
          Paste your conversation share link:
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LinkIcon className="h-5 w-5 text-slate-400" />
            </div>
            <input
              id="url-input"
              type="url"
              className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              placeholder="https://chatgpt.com/share/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchConversation()}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchConversation}
              disabled={loading || !url}
              className="flex-1 sm:flex-none inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {loading ? 'Fetching...' : 'Fetch'}
            </button>
            <button
              onClick={() => { setUrl(''); setMessages([]) }}
              className="inline-flex items-center justify-center p-3 border border-slate-300 text-sm font-medium rounded-xl text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-colors"
              title="Clear"
            >
              <Trash2 className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="w-full max-w-3xl flex flex-col flex-grow">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center">
            <Smartphone className="w-5 h-5 mr-2 text-slate-500" />
            Preview
          </h2>
          {messages.length > 0 && (
            <button
              onClick={downloadPdf}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-grow flex flex-col relative print:border-none print:shadow-none">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-64 print:hidden">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm max-w-xs">
                No preview yet. Paste a public share link and click Fetch to see the conversation here.
              </p>
            </div>
          ) : (
            <div 
              className="p-4 md:p-8 overflow-y-auto max-h-[65vh] prose prose-slate max-w-none print:max-h-none print:overflow-visible" 
            >
              <div ref={previewRef} className="space-y-6 pb-4">
                {/* Print-only title */}
                <div className="hidden print:block mb-8 border-b pb-4">
                  <h1 className="text-2xl font-bold text-slate-900 m-0">Exported Conversation</h1>
                  <p className="text-sm text-slate-500 m-0 mt-1">Source: {url}</p>
                </div>
                
                {messages.map((m, i) => {
                  const isUser = m.role.toLowerCase().includes('user')
                  return (
                    <div key={i} className="flex gap-4 p-1 print:break-inside-avoid print-avoid-break">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isUser ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isUser ? 'U' : 'AI'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 mb-1 capitalize">
                          {isUser ? 'User' : 'Assistant'}
                        </div>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-12 text-center pb-8 print:hidden">
        <p className="text-xs text-slate-500">Built with Next.js • Mobile-first UI • Client-side generation</p>
      </footer>
    </div>
  )
}
