# Commercial documents

Detailed procedures and delivery notes moved from the repository README at
[source 1d696bd](https://github.com/code-corhuila/synkro-sales-portal/blob/1d696bdb97ebac08663153eb6712954d29774516/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Commercial PDF and XML documents

Authorized ADMIN and SALESPERSON can download PDF/XML from /sales/{id}; INVENTORY has no action and actual authorization remains with Sales API. Both outputs share one model: amounts, date and status are persisted sale data, while customer/product display data is current at generation time rather than historical snapshots.

These are commercial documents, not fiscal electronic invoices: no CUFE, tax QR, tax resolution or digital fiscal signature is claimed. The original document phase did not provide a commercial sequence; the later yearly commercial-reference delivery adds that independent reference without changing this fiscal boundary.

Build-time VITE_ISSUER_* inputs configure required legal name/tax id and optional address/phone/email. Docker/Compose and .env.example carry public confirmed issuer values, which can be replaced. Invalid required issuer data disables download. Missing current related data is replaced by an explicit id/reference notice without losing historical amounts.

Reference: code-corhuila/synkro-docs#301. [Document design](sale-documents-design.md) records field provenance, limits and the original directed real acceptance (11 checks and five PDF/XML pairs, with review/promotion separate). The [XML schema](schemas/sale-document-1.1.xsd) defines the document shape.
