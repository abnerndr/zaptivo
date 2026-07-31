import sgMail from '@sendgrid/mail'

let configured = false

function ensureClient(): boolean {
  const key = process.env.SENDGRID_API_KEY?.trim()
  if (!key) return false
  if (!configured) {
    sgMail.setApiKey(key)
    configured = true
  }
  return true
}

export type InviteEmailArgs = {
  to: string
  orgName: string
  roleLabel: string
  joinUrl: string
  expiresAt: Date
}

/**
 * Send an org invite email via SendGrid.
 * Returns `{ sent: false, reason }` when API key/from are missing
 * so callers can still return the invite URL for copy/paste.
 */
export async function sendInviteEmail(
  args: InviteEmailArgs,
): Promise<{ sent: boolean; reason?: string }> {
  const from = process.env.SENDGRID_FROM_EMAIL?.trim()
  if (!ensureClient()) {
    return { sent: false, reason: 'SENDGRID_API_KEY not configured' }
  }
  if (!from) {
    return { sent: false, reason: 'SENDGRID_FROM_EMAIL not configured' }
  }

  const expiresLabel = args.expiresAt.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const subject = `Convite para ${args.orgName}`
  const text = [
    `Você foi convidado(a) para entrar em ${args.orgName} como ${args.roleLabel}.`,
    '',
    `Aceite o convite neste link (válido até ${expiresLabel}):`,
    args.joinUrl,
    '',
    'Se você não esperava este e-mail, ignore-o.',
  ].join('\n')

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <p>Você foi convidado(a) para entrar em <strong>${escapeHtml(args.orgName)}</strong> como <strong>${escapeHtml(args.roleLabel)}</strong>.</p>
      <p><a href="${escapeAttr(args.joinUrl)}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px">Aceitar convite</a></p>
      <p style="color:#666;font-size:14px">Link válido até ${escapeHtml(expiresLabel)}.</p>
      <p style="color:#666;font-size:12px">Se você não esperava este e-mail, ignore-o.</p>
    </div>
  `

  try {
    await sgMail.send({
      to: args.to,
      from,
      subject,
      text,
      html,
    })
    return { sent: true }
  } catch (err) {
    console.error('[sendgrid] invite email failed', err)
    return {
      sent: false,
      reason: err instanceof Error ? err.message : 'SendGrid error',
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}
