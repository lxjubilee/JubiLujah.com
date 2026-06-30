-- ============================================================================
-- 0016_invoice_pdf.sql — direct invoice PDF link on payment records
--
-- Stripe exposes two links on an invoice: `hosted_invoice_url` (a web page) and
-- `invoice_pdf` (a direct .pdf download). We already store the former in
-- payment_records.invoice_url; this adds the latter so the billing UI can offer a
-- one-click "Download" alongside "View". Still a reference only — no PCI data, no
-- stored document; the PDF is served by Stripe.
-- ============================================================================

ALTER TABLE production.payment_records
    ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT;

COMMENT ON COLUMN production.payment_records.invoice_pdf_url IS 'Stripe invoice.invoice_pdf — direct PDF download link (reference only).';
