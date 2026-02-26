import { NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

export const maxDuration = 60; // 60 seconds

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url')

  if (!targetUrl || !targetUrl.startsWith('https://chatgpt.com/share/')) {
    return NextResponse.json({ error: 'Invalid or missing ChatGPT share URL' }, { status: 400 })
  }

  let browser = null

  try {
    // Specifically configuring for Vercel
    const executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v119.0.2/chromium-v119.0.2-pack.tar'
    )

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 1600 },
      executablePath: executablePath,
      headless: true, // true or 'new' depending on version
    })

    const page = await browser.newPage()
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 })

    await page.evaluate(() => {
      const style = document.createElement('style')
      style.innerHTML = `
        nav, header, footer, .sticky.bottom-0, [id^="radix-"], 
        .flex-shrink-0.overflow-x-hidden.bg-token-sidebar-surface-primary, 
        .gizmo-shadow-stroke, .group.fixed.bottom-3.right-3 {
          display: none !important;
        }
        body, main, [role="presentation"] {
          background: white !important;
        }
        .flex.h-full.flex-col.items-center.justify-center,
        .flex.flex-col.text-sm.dark\\:bg-gray-800 {
           width: 100% !important;
           max-width: none !important;
           padding: 0 !important;
           margin: 0 !important;
        }
        @media print {
          body { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
          .prose { max-width: 100% !important; }
        }
      `
      document.head.appendChild(style)
    })

    await new Promise(resolve => setTimeout(resolve, 1000))

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px'
      }
    })

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="chat-export.pdf"`
      }
    })

  } catch (error: any) {
    console.error('PDF Generation Error:', error)
    return NextResponse.json({ error: `Failed to generate PDF: ${error.message}` }, { status: 500 })
  } finally {
    if (browser !== null) {
      await browser.close()
    }
  }
}
