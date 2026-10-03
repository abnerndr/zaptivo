import { prisma } from "@/domain/db/prisma"
export async function resolveImportTags(accountId: string, userId: string, names: string[]) {
  const tags = []
  for (const name of names) {
    let tag = await prisma.tag.findFirst({ where: { accountId, name } })
    if (!tag) tag = await prisma.tag.create({ data: { accountId, userId, name } })
    tags.push(tag)
  }
  return tags
}
