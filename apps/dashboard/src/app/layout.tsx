import { Inter, Playfair_Display } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/sidebar'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata = {
  title: "What's In A Baby Name",
  description: 'Brand partnership engine for Taylor Humphrey',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`
          ${inter.variable} ${playfair.variable}
          font-sans min-h-screen bg-surface-base text-ink antialiased
        `}
      >
        <div className="flex">
          <Sidebar />
          <main className="ml-64 flex-1 p-8 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  )
}
