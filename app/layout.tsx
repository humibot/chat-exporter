import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'Chat Exporter',
  description: 'Download shared LLM conversations (ChatGPT/Claude/Gemini) as PDF',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-gray-50 text-gray-900">{children}</main>
      </body>
    </html>
  )
}
