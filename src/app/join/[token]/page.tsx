'use client'
import Link from "next/link"
export default function JoinPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">Convite</h1>
        <p className="text-sm text-muted-foreground">
          Fluxo de convite em migração para Auth.js. Faça login e peça um novo link.
        </p>
        <Link href="/login" className="text-primary underline">Ir para login</Link>
      </div>
    </div>
  )
}
