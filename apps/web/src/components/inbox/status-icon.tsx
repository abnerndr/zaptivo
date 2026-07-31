'use client'

import { Clock, Check, CheckCheck, XCircle } from 'lucide-react'
import type { MessageStatus } from '@/types'

export function StatusIcon({ status }: { status: MessageStatus | string }) {
  switch (status) {
    case 'sending':
      return <Clock className="h-3 w-3 text-muted-foreground" />
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-400" />
    case 'failed':
      return <XCircle className="h-3 w-3 text-red-400" />
    default:
      return null
  }
}
