import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../lib/asyncHandler"
import prisma from "../lib/prisma"
import { actorIdFromRequest, requireFloorPlanInProject, scopedProjectId } from "../lib/projectScope"

const router: Router = Router({ mergeParams: true })
const floorPlanIdSchema = z.coerce.number().int().positive()
const preferenceSchema = z.object({ backgroundDimmed: z.boolean() }).strict()

async function ensurePlanInScope(floorPlanId: unknown, projectId: number): Promise<number> {
  const id = floorPlanIdSchema.parse(floorPlanId)
  await requireFloorPlanInProject(id, projectId)
  return id
}

router.get("/:floorPlanId", asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const floorPlanId = await ensurePlanInScope(req.params.floorPlanId, projectId)
  const preference = await prisma.floorPlanUserPreference.findUnique({
    where: { floorPlanId_userId: { floorPlanId, userId: actorIdFromRequest(req) } },
    select: { backgroundDimmed: true },
  })
  res.json({ floorPlanId, backgroundDimmed: preference?.backgroundDimmed ?? true })
}))

router.put("/:floorPlanId", asyncHandler(async (req, res) => {
  const projectId = scopedProjectId(req)
  const floorPlanId = await ensurePlanInScope(req.params.floorPlanId, projectId)
  const input = preferenceSchema.parse(req.body)
  const preference = await prisma.floorPlanUserPreference.upsert({
    where: { floorPlanId_userId: { floorPlanId, userId: actorIdFromRequest(req) } },
    create: { floorPlanId, userId: actorIdFromRequest(req), backgroundDimmed: input.backgroundDimmed },
    update: { backgroundDimmed: input.backgroundDimmed },
    select: { floorPlanId: true, backgroundDimmed: true },
  })
  res.json(preference)
}))

export default router
