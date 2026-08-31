import prisma from "./prisma"
import { removeDocumentFile } from "./documentStorage"
import { removeFloorPlanFiles } from "./floorPlanStorage"

type ProjectFiles = {
  documentStorageKeys: string[]
  assetImageStorageKeys: string[]
  floorPlanVersions: Array<{ storageKey: string; dziKey: string }>
}

/**
 * Deletes the complete project aggregate after authorization has already been
 * resolved. Database cascades remove relational data atomically; files are
 * collected before that transaction and removed immediately afterwards.
 */
export async function permanentlyDeleteProject(input: {
  projectId: number
  workspaceId: number
  actorId: number
}): Promise<{ name: string }> {
  const deleted = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId },
      select: {
        id: true,
        name: true,
        documents: { select: { versions: { select: { storageKey: true, attachments: { select: { storageKey: true } } } } } },
        assets: { select: { images: { select: { storageKey: true } } } },
        floorPlans: { select: { versions: { select: { storageKey: true, dziKey: true } } } },
      },
    })
    if (!project) throw Object.assign(new Error("Proyecto no encontrado."), { status: 404 })

    const files: ProjectFiles = {
      documentStorageKeys: project.documents.flatMap((document) => document.versions.flatMap((version) => [version.storageKey, ...version.attachments.map((attachment) => attachment.storageKey)])),
      assetImageStorageKeys: project.assets.flatMap((asset) => asset.images.map((image) => image.storageKey)),
      floorPlanVersions: project.floorPlans.flatMap((plan) => plan.versions),
    }

    // Keep the evidence at workspace level: a project-scoped audit entry would
    // correctly cascade with the deleted aggregate and therefore disappear.
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.actorId,
        action: "Proyecto eliminado definitivamente",
        entityId: `project:${project.id}`,
        detail: `Proyecto "${project.name}" y sus datos asociados eliminados definitivamente.`,
      },
    })
    await tx.project.delete({ where: { id: project.id } })
    return { name: project.name, files }
  })

  await Promise.all([
    ...deleted.files.documentStorageKeys.map((storageKey) => removeDocumentFile(storageKey)),
    ...deleted.files.assetImageStorageKeys.map((storageKey) => removeDocumentFile(storageKey)),
    ...deleted.files.floorPlanVersions.map(removeFloorPlanFiles),
  ])

  return { name: deleted.name }
}
