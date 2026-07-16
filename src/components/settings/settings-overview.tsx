'use client'

export function SettingsOverview(props: {
  onSelect?: (
    next:
      | 'profile'
      | 'deals'
      | 'security'
      | 'api'
      | 'members'
      | 'overview'
      | 'appearance'
      | 'whatsapp'
      | 'templates'
      | 'quick-replies'
      | 'fields'
  ) => void
}) {
  return (
    <div className="space-y-2 p-4">
      <p className="text-sm text-muted-foreground">Visão geral em migração.</p>
      <button
        type="button"
        className="text-sm text-primary"
        onClick={() => props.onSelect?.('whatsapp')}
      >
        Ir para WhatsApp
      </button>
    </div>
  )
}

export default SettingsOverview
