import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import multer from 'multer'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', details: err.errors })
    return
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Document exceeds the 10 MB limit' : 'Invalid multipart document upload'
    res.status(400).json({ error: message })
    return
  }

  if (err instanceof Error && (err.message === 'Unsupported document type' || err.message === 'Invalid document size' || err.message === 'Invalid document storage key' || err.message === 'Unsupported image type' || err.message === 'Invalid image size' || err.message === 'Unsupported floor plan type' || err.message === 'Invalid floor plan size' || err.message === 'Invalid floor plan image' || err.message === 'Invalid floor plan storage key' || err.message === 'Invalid floor plan DZI key' || err.message === 'Invalid floor plan tile')) {
    res.status(400).json({ error: err.message })
    return
  }

  if (err instanceof Error && 'status' in err && typeof err.status === 'number') {
    res.status(err.status).json({ error: err.message })
    return
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Conflict', message: 'Unique constraint violated' })
      return
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: 'Conflict', message: 'Record is referenced by other entities' })
      return
    }
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
