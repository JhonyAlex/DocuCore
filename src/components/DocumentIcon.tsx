import type { LucideIcon } from 'lucide-react'
import {
  Archive, Award, BadgeCheck, Book, BookOpen, Briefcase, Calendar, CheckCircle, CircleAlert,
  ClipboardCheck, ClipboardList, Cpu, FileCheck, FileCode, Files, FileSignature, FileSpreadsheet,
  FileText, Flame, Folder, Gauge, Inbox, Lock, Receipt, Scale, Scroll, Settings, Shield,
  ShieldAlert, ShieldCheck, Stamp, Tag, Wrench,
} from 'lucide-react'
import { resolveDocumentIconKey } from '@/lib/documentIconRegistry'
import type { DocumentIconKey } from '../../shared/documentIconCatalog'

const iconComponents: Record<DocumentIconKey, LucideIcon> = {
  'file-signature': FileSignature,
  'file-text': FileText,
  scale: Scale,
  stamp: Stamp,
  scroll: Scroll,
  briefcase: Briefcase,
  'badge-check': BadgeCheck,
  award: Award,
  'shield-check': ShieldCheck,
  'file-check': FileCheck,
  'check-circle': CheckCircle,
  'book-open': BookOpen,
  book: Book,
  wrench: Wrench,
  settings: Settings,
  'file-code': FileCode,
  cpu: Cpu,
  gauge: Gauge,
  'clipboard-list': ClipboardList,
  'clipboard-check': ClipboardCheck,
  'file-spreadsheet': FileSpreadsheet,
  receipt: Receipt,
  calendar: Calendar,
  shield: Shield,
  'shield-alert': ShieldAlert,
  'circle-alert': CircleAlert,
  lock: Lock,
  flame: Flame,
  folder: Folder,
  files: Files,
  tag: Tag,
  archive: Archive,
  inbox: Inbox,
}

interface DocumentIconProps {
  iconKey?: string | null
  className?: string
  size?: number
  strokeWidth?: number
  title?: string
}

export default function DocumentIcon({ iconKey, className, size = 18, strokeWidth = 1.8, title }: DocumentIconProps) {
  const resolvedKey = resolveDocumentIconKey(iconKey)
  const Icon = iconComponents[resolvedKey] ?? FileText
  return <Icon aria-hidden={title ? undefined : true} aria-label={title} data-document-icon={resolvedKey} className={className} size={size} strokeWidth={strokeWidth} />
}
