export type RealtimePayload = {
  type?: 'ping' | 'ready' | 'reconnect'
  table?: string
  op?: 'INSERT' | 'UPDATE' | 'DELETE'
  id?: string
  accountId?: string
  conversationId?: string
  contactId?: string
  text?: string | null
  direction?: 'in' | 'out'
  contentType?: string
  mediaUrl?: string | null
  status?: string
  createdAt?: string
  movedFromConversationId?: string
  movedToConversationId?: string
}

/** Payload accepted by `notifyAccount`: routing fields are mandatory. */
export type NotifiablePayload = RealtimePayload &
  Required<Pick<RealtimePayload, 'table' | 'op' | 'id' | 'accountId'>>

export function messageInsertPayload(args: {
  id: string
  accountId: string
  conversationId: string
  contactId: string
  text: string | null
  fromMe: boolean
  contentType: string
  mediaUrl: string | null
  status: string
  createdAt: Date
}): NotifiablePayload {
  return {
    table: 'messages',
    op: 'INSERT',
    id: args.id,
    accountId: args.accountId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    text: args.text,
    direction: args.fromMe ? 'out' : 'in',
    contentType: args.contentType,
    mediaUrl: args.mediaUrl,
    status: args.status,
    createdAt: args.createdAt.toISOString(),
  }
}
