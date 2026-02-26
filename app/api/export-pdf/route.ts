import { NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

// Setting a max duration for Vercel Serverless functions (Pro allows more, Hobby allows 10-60s)
export const maxDuration = 60; // 60 seconds

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url')

  if (!targetUrl || !targetUrl.startsWith('https://chatgpt.com/share/')) {
    return NextResponse.json({ error: 'Invalid or missing ChatGPT share URL' }, { status: 400 })
  }

  let browser = null

  try {
    // Configure chromium for serverless environment
    chromium.setGraphicsMode = false
    const executablePath = await chromium.executablePath()

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 1600 },
      executablePath: executablePath || process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: chromium.headless,
    })

    const page = await browser.newPage()

    // Navigate to the chat page
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 })

    // Inject CSS to clean up the page for printing
    // We hide the sidebar, header, footer, bottom prompt bar, and any signup modals.
    // We expand the main conversation container.
    await page.evaluate(() => {
      const style = document.createElement('style')
      style.innerHTML = `
        /* Hide unwanted UI elements */
        nav, 
        header, 
        footer, 
        .sticky.bottom-0, /* Bottom prompt input area */
        [id^="radix-"], /* Modals/Dialogs */
        .flex-shrink-0.overflow-x-hidden.bg-token-sidebar-surface-primary, /* Sidebar */
        .gizmo-shadow-stroke, /* Top bar shadow */
        .group.fixed.bottom-3.right-3 /* Floating buttons */
        {
          display: none !important;
        }

        /* Expand main content */
        body, main, [role="presentation"] {
          background: white !important;
        }
        
        /* Adjust conversation container for print */
        .flex.h-full.flex-col.items-center.justify-center,
        .flex.flex-col.text-sm.dark\\:bg-gray-800 {
           width: 100% !important;
           max-width: none !important;
           padding: 0 !important;
           margin: 0 !important;
        }
        
        /* Ensure avatars and text print well */
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

    // Give it a moment to ensure styles are applied and fonts loaded
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Generate PDF
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

    // Return the PDF
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
