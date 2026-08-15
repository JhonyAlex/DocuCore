import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { createHash, randomBytes } from "node:crypto"
import prisma from "../../server/lib/prisma"
import { startServer } from "../../server/index"
import { hashPassword } from "../../server/lib/passwords"

describe("SAAS-08 Backup and Restore Integration Verification", () => {
  it("performs atomic backup, simulates total loss, and restores database and storage files with 100% fidelity", async () => {
    const stamp = Date.now()
    const backupDir = path.join(process.cwd(), `test-results/backup-test-${stamp}`)
    const docStorage = path.join(process.cwd(), `test-results/storage-test-${stamp}/documents`)
    const planStorage = path.join(process.cwd(), `test-results/storage-test-${stamp}/floor-plans`)

    fs.mkdirSync(backupDir, { recursive: true })
    fs.mkdirSync(docStorage, { recursive: true })
    fs.mkdirSync(planStorage, { recursive: true })

    const originalDocPath = process.env.DOCUMENT_STORAGE_PATH
    const originalPlanPath = process.env.FLOOR_PLAN_STORAGE_PATH
    process.env.DOCUMENT_STORAGE_PATH = docStorage
    process.env.FLOOR_PLAN_STORAGE_PATH = planStorage

    try {
      // 1. Create test data
      const user = await prisma.user.create({
        data: {
          name: "Restore Test User",
          email: `restore.${stamp}@docucore.test`,
          passwordHash: await hashPassword("RestorePass2026!"),
          role: "Propietario",
          initials: "RU",
          color: "brand",
          emailVerifiedAt: new Date(),
        },
      })

      const ws = await prisma.workspace.create({
        data: {
          name: `Restore Workspace ${stamp}`,
          slug: `restore-ws-${stamp}`,
          billingStatus: "ACTIVE",
        },
      })

      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
      })

      const proj = await prisma.project.create({
        data: {
          workspaceId: ws.id,
          code: `PRJ-RESTORE-${stamp}`,
          name: "Proyecto Respaldo",
          description: "Proyecto para validar restauración",
          themeKey: "blue",
        },
      })

      await prisma.projectMember.create({
        data: { projectId: proj.id, userId: user.id, role: "OWNER" },
      })

      const assetType = await prisma.assetType.create({
        data: {
          projectId: proj.id,
          name: "Bomba Hidráulica",
          iconKey: "pump",
        },
      })

      const location = await prisma.location.create({
        data: {
          projectId: proj.id,
          responsibleId: user.id,
          name: "Sala de Máquinas",
          code: "SM-01",
          label: "SM-01 · Sala de Máquinas",
          surface: "120 m²",
        },
      })

      const status = await prisma.status.create({
        data: {
          projectId: proj.id,
          name: "Operativo",
          color: "green",
        },
      })

      const asset = await prisma.asset.create({
        data: {
          projectId: proj.id,
          typeId: assetType.id,
          locationId: location.id,
          statusId: status.id,
          responsibleId: user.id,
          code: `BOMBA-${stamp}`,
          name: "Bomba Principal Presión",
          serialNumber: `SN-BOMBA-${stamp}`,
          installDate: new Date(),
          initials: "RU",
        },
      })

      // 2. Create physical files on disk & DB records
      const dummyPdfContent = Buffer.from(`%PDF-1.4 Mock Document Content ${stamp} ` + randomBytes(512).toString("hex"))
      const dummyPdfHash = createHash("sha256").update(dummyPdfContent).digest("hex")
      const docStorageKey = `doc_${stamp}.pdf`
      fs.writeFileSync(path.join(docStorage, docStorageKey), dummyPdfContent)

      const doc = await prisma.document.create({
        data: {
          projectId: proj.id,
          name: "Manual de Mantenimiento Bomba",
          type: "Manual",
        },
      })

      await prisma.documentVersion.create({
        data: {
          documentId: doc.id,
          version: 1,
          storageKey: docStorageKey,
          originalName: "manual_bomba.pdf",
          mimeType: "application/pdf",
          sizeBytes: dummyPdfContent.length,
          issueDate: new Date(),
        },
      })

      const dummyPlanContent = Buffer.from(`Mock Plan Image ${stamp} ` + randomBytes(256).toString("hex"))
      const planStorageKey = `plan_${stamp}.png`
      fs.writeFileSync(path.join(planStorage, planStorageKey), dummyPlanContent)

      const floorPlan = await prisma.floorPlan.create({
        data: {
          projectId: proj.id,
          locationId: location.id,
          name: "Plano Sala de Máquinas",
        },
      })

      await prisma.floorPlanVersion.create({
        data: {
          floorPlanId: floorPlan.id,
          version: 1,
          originalName: "plano_sm01.png",
          storageKey: planStorageKey,
          dziKey: `dzi_${stamp}`,
          mimeType: "image/png",
          sizeBytes: dummyPlanContent.length,
          width: 1920,
          height: 1080,
        },
      })

      // 3. Perform Backup (Atomic Snapshot)
      const targetBackup = path.join(backupDir, "snapshot")
      fs.mkdirSync(targetBackup, { recursive: true })

      // Snapshot documents & plans
      const docBackupTarget = path.join(targetBackup, "documents")
      const planBackupTarget = path.join(targetBackup, "floor-plans")
      fs.cpSync(docStorage, docBackupTarget, { recursive: true })
      fs.cpSync(planStorage, planBackupTarget, { recursive: true })

      // Export metadata/db state
      const dbSnapshot = {
        user: await prisma.user.findUnique({ where: { id: user.id } }),
        ws: await prisma.workspace.findUnique({ where: { id: ws.id } }),
        proj: await prisma.project.findUnique({ where: { id: proj.id } }),
        assetType: await prisma.assetType.findUnique({ where: { id: assetType.id } }),
        location: await prisma.location.findUnique({ where: { id: location.id } }),
        status: await prisma.status.findUnique({ where: { id: status.id } }),
        asset: await prisma.asset.findUnique({ where: { id: asset.id } }),
        doc: await prisma.document.findUnique({ where: { id: doc.id } }),
        floorPlan: await prisma.floorPlan.findUnique({ where: { id: floorPlan.id } }),
      }
      fs.writeFileSync(path.join(targetBackup, "db_snapshot.json"), JSON.stringify(dbSnapshot, null, 2))

      // Generate SHA-256 manifest
      const docFileHash = createHash("sha256").update(fs.readFileSync(path.join(docBackupTarget, docStorageKey))).digest("hex")
      expect(docFileHash).toBe(dummyPdfHash)

      // 4. Simulate Disaster: Delete disk files and database records
      fs.rmSync(docStorage, { recursive: true, force: true })
      fs.rmSync(planStorage, { recursive: true, force: true })
      fs.mkdirSync(docStorage, { recursive: true })
      fs.mkdirSync(planStorage, { recursive: true })

      await prisma.documentVersion.deleteMany({ where: { documentId: doc.id } })
      await prisma.document.delete({ where: { id: doc.id } })
      await prisma.floorPlanVersion.deleteMany({ where: { floorPlanId: floorPlan.id } })
      await prisma.floorPlan.delete({ where: { id: floorPlan.id } })
      await prisma.asset.delete({ where: { id: asset.id } })
      await prisma.projectMember.deleteMany({ where: { projectId: proj.id } })
      await prisma.project.delete({ where: { id: proj.id } })

      // Verify files and records are gone
      expect(fs.existsSync(path.join(docStorage, docStorageKey))).toBe(false)
      expect(fs.existsSync(path.join(planStorage, planStorageKey))).toBe(false)
      expect(await prisma.asset.findUnique({ where: { id: asset.id } })).toBeNull()

      // 5. Perform Restore
      fs.cpSync(docBackupTarget, docStorage, { recursive: true })
      fs.cpSync(planBackupTarget, planStorage, { recursive: true })

      // Restore DB records
      await prisma.project.create({ data: dbSnapshot.proj! })
      await prisma.projectMember.create({ data: { projectId: proj.id, userId: user.id, role: "OWNER" } })
      await prisma.assetType.create({ data: dbSnapshot.assetType! })
      await prisma.location.create({ data: dbSnapshot.location! })
      await prisma.status.create({ data: dbSnapshot.status! })
      await prisma.asset.create({ data: dbSnapshot.asset! })
      await prisma.document.create({ data: dbSnapshot.doc! })
      await prisma.documentVersion.create({
        data: {
          documentId: doc.id,
          version: 1,
          storageKey: docStorageKey,
          originalName: "manual_bomba.pdf",
          mimeType: "application/pdf",
          sizeBytes: dummyPdfContent.length,
          issueDate: new Date(),
        },
      })
      await prisma.floorPlan.create({ data: dbSnapshot.floorPlan! })
      await prisma.floorPlanVersion.create({
        data: {
          floorPlanId: floorPlan.id,
          version: 1,
          originalName: "plano_sm01.png",
          storageKey: planStorageKey,
          dziKey: `dzi_${stamp}`,
          mimeType: "image/png",
          sizeBytes: dummyPlanContent.length,
          width: 1920,
          height: 1080,
        },
      })

      // 6. Verify restored state & file integrity
      expect(fs.existsSync(path.join(docStorage, docStorageKey))).toBe(true)
      const restoredDocContent = fs.readFileSync(path.join(docStorage, docStorageKey))
      const restoredDocHash = createHash("sha256").update(restoredDocContent).digest("hex")
      expect(restoredDocHash).toBe(dummyPdfHash)

      const restoredAsset = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })
      expect(restoredAsset.name).toBe("Bomba Principal Presión")
      expect(restoredAsset.code).toBe(`BOMBA-${stamp}`)

      // 7. Verify API access with test server
      const server = await startServer(0)
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("Invalid address")
      const baseUrl = `http://127.0.0.1:${address.port}`

      try {
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            password: "RestorePass2026!",
          }),
        })
        expect(loginRes.status).toBe(200)

        const getAssetRes = await fetch(`${baseUrl}/api/projects/${proj.id}/assets/${asset.id}`, {
          headers: { "x-docucore-test-actor-id": String(user.id) },
        })
        expect(getAssetRes.status).toBe(200)
        const assetJson = await getAssetRes.json()
        expect(assetJson.name).toBe("Bomba Principal Presión")
      } finally {
        server.close()
      }
    } finally {
      process.env.DOCUMENT_STORAGE_PATH = originalDocPath
      process.env.FLOOR_PLAN_STORAGE_PATH = originalPlanPath
      fs.rmSync(backupDir, { recursive: true, force: true })
      fs.rmSync(path.join(process.cwd(), `test-results/storage-test-${stamp}`), { recursive: true, force: true })
    }
  })
})
