import { isInvoiceText, parseInvoice, type Invoice } from '../engine/reconcile';
import { parseInsuranceCard } from './insuranceCard';
import { parseTreatmentPlanText } from './treatmentPlan';
import type { IntakeItem } from './types';

export type DocumentKind = 'treatment_plan' | 'invoice' | 'plan_summary' | 'insurance_card' | 'unknown';

/** Text read from a document (OCR, Textract or a PDF text layer) → what it is and, for a treatment plan, its procedures. */
export function classifyDocument(
  text: string,
  isImage: boolean,
): { kind: DocumentKind; items: IntakeItem[]; unrecognized: string[]; invoice?: Invoice } {
  // A dentist's bill lists codes too, but it's a record of a visit, not planned work.
  if (isInvoiceText(text)) return { kind: 'invoice', items: [], unrecognized: [], invoice: parseInvoice(text) };
  const plan = parseTreatmentPlanText(text, isImage ? 'photo' : 'upload');
  const kind: DocumentKind = plan.items.length
    ? 'treatment_plan'
    : /annual (deductible|maximum)/i.test(text)
      ? 'plan_summary'
      : parseInsuranceCard(text).groupNumber
        ? 'insurance_card'
        : 'unknown';
  return { kind, items: plan.items, unrecognized: plan.unrecognized };
}
