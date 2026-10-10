// QR + shareable link for a Quest Circle's member sign-up page.
//
// Kept separate from AttendanceQRDisplay: that one is a full-screen projector
// view with a live counter, while this is an inline card a leader shows on
// their phone. Same QR library, different job.

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { buildJoinUrl } from '../lib/constants'

interface SignupQRCardProps {
  token: string
  groupName: string
  enabled: boolean
  size?: number
}

export function SignupQRCard({ token, groupName, enabled, size = 200 }: SignupQRCardProps) {
  const [copied, setCopied] = useState(false)
  const url = buildJoinUrl(token)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className={`bg-white p-3 sm:p-4 rounded-2xl border border-gray-200 max-w-full ${enabled ? '' : 'opacity-40'}`}
        aria-label={`Sign-up QR code for ${groupName}`}
      >
        {/* width:100% + a max of `size` keeps the QR sharp on a phone and
            stops it forcing horizontal scroll on a 320px screen. */}
        <QRCodeSVG
          value={url}
          size={size}
          level="M"
          style={{ width: '100%', height: 'auto', maxWidth: size }}
        />
      </div>

      {!enabled && (
        <p className="mt-3 text-sm text-amber-700 text-center">
          Sign-up link off. Turn on before showing.
        </p>
      )}

      <p className="mt-3 text-xs text-gray-500 text-center">Scan for Quest account setup</p>

      <div className="mt-3 w-full flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 min-h-11 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
          aria-label="Sign-up link"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 min-h-11 px-4 py-2.5 text-sm font-semibold bg-[#8B1538] hover:bg-[#6B0F2B] text-white rounded-lg transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
