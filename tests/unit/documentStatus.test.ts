import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_EXPIRY_THRESHOLD_DAYS,
  UPCOMING_THRESHOLD_DAYS,
  computeDocumentDaysUntil,
  computeDocumentStatus,
  computeAssetDocumentsSummary,
} from '../../shared/documentStatus'
import { getDocumentStatusStyle } from '../../src/lib/documentStatus'

describe('shared documentStatus domain logic (single source of truth)', () => {
  const now = new Date('2026-09-01T12:00:00.000Z')

  it('exports consistent 30-day thresholds for the platform', () => {
    expect(DOCUMENT_EXPIRY_THRESHOLD_DAYS).toBe(30)
    expect(UPCOMING_THRESHOLD_DAYS).toBe(30)
  })

  it('calculates days until expiry accurately', () => {
    expect(computeDocumentDaysUntil(null, now)).toBeNull()
    expect(computeDocumentDaysUntil(undefined, now)).toBeNull()
    expect(computeDocumentDaysUntil('2026-09-01T00:00:00.000Z', now)).toBe(0)
    expect(computeDocumentDaysUntil('2026-09-11T00:00:00.000Z', now)).toBe(10)
    expect(computeDocumentDaysUntil('2026-08-31T00:00:00.000Z', now)).toBe(-1)
  })

  it('calculates Sin vencimiento when expiryDate is missing or invalid', () => {
    expect(computeDocumentStatus(null, now)).toBe('Sin vencimiento')
    expect(computeDocumentStatus(undefined, now)).toBe('Sin vencimiento')
    expect(computeDocumentStatus('', now)).toBe('Sin vencimiento')
    expect(computeDocumentStatus('invalid-date', now)).toBe('Sin vencimiento')
  })

  it('calculates Vencido when expiry date is in the past', () => {
    expect(computeDocumentStatus('2026-08-31T00:00:00.000Z', now)).toBe('Vencido')
    expect(computeDocumentStatus('2026-01-15T00:00:00.000Z', now)).toBe('Vencido')
  })

  it('calculates Próximo a vencer when expiry date is within 30 days', () => {
    expect(computeDocumentStatus('2026-09-01T00:00:00.000Z', now)).toBe('Próximo a vencer')
    expect(computeDocumentStatus('2026-09-15T00:00:00.000Z', now)).toBe('Próximo a vencer')
    expect(computeDocumentStatus('2026-10-01T00:00:00.000Z', now)).toBe('Próximo a vencer')
  })

  it('calculates Vigente when expiry date is further than 30 days away', () => {
    expect(computeDocumentStatus('2026-10-15T00:00:00.000Z', now)).toBe('Vigente')
    expect(computeDocumentStatus('2027-09-01T00:00:00.000Z', now)).toBe('Vigente')
  })

  it('provides matching styles for each document status', () => {
    const vigenteStyle = getDocumentStatusStyle('Vigente')
    expect(vigenteStyle.label).toBe('Vigente')
    expect(vigenteStyle.chipClass).toContain('emerald')

    const proximoStyle = getDocumentStatusStyle('Próximo a vencer')
    expect(proximoStyle.label).toBe('Próximo a vencer')
    expect(proximoStyle.chipClass).toContain('amber')

    const vencidoStyle = getDocumentStatusStyle('Vencido')
    expect(vencidoStyle.label).toBe('Vencido')
    expect(vencidoStyle.chipClass).toContain('red')

    const sinVencStyle = getDocumentStatusStyle('Sin vencimiento')
    expect(sinVencStyle.label).toBe('Sin vencimiento')
    expect(sinVencStyle.chipClass).toContain('slate')
  })

  it('computes asset documents summary totals correctly', () => {
    const docs = [
      { currentVersion: { expiryDate: '2027-09-01T00:00:00.000Z' } }, // Vigente
      { currentVersion: { expiryDate: '2027-10-01T00:00:00.000Z' } }, // Vigente
      { currentVersion: { expiryDate: '2026-09-15T00:00:00.000Z' } }, // Próximo
      { currentVersion: { expiryDate: '2026-08-01T00:00:00.000Z' } }, // Vencido
      { currentVersion: { expiryDate: null } },                       // Sin vencimiento
    ]

    const summary = computeAssetDocumentsSummary(docs, now)
    expect(summary.total).toBe(5)
    expect(summary.vigentes).toBe(2)
    expect(summary.proximos).toBe(1)
    expect(summary.vencidos).toBe(1)
    expect(summary.sinVencimiento).toBe(1)
    expect(summary.summaryText).toBe('2 vigentes · 1 próxima a vencer · 1 vencida')
  })
})
