# Detail Popup & Form Patterns

Read this when refining forms/details in Phase 3B. Do NOT read upfront.

## Tab Structure Rules

`nb_set_detail` automatically validates the tab structure. If multiple tabs are passed without an `assoc` (subtable association), the tool will reject the input and prompt you to merge them.

**Tab 1 = Main record overview**: All fields organized with `--- Section` groups + js_items summary cards.
**Tab 2+ = Associated subtables only**: Each o2m relationship gets its own tab.

Rule of thumb: Fields from the same table go in the same tab with `---` section dividers. Related records from different tables get separate tabs.

## DETAIL = A FULL PAGE

A detail popup is NOT a field viewer. It is the user's workspace for this record.

### What makes a good detail page

| Component | Purpose | Example |
|-----------|---------|---------|
| **Summary card** (js_item) | Instant understanding | Customer: A-grade, Signed, Tech industry, 180 days since created |
| **Key metrics** (js_item) | Numbers that matter | Opportunity: $500K, 50% probability, 30 days remaining |
| **Field sections** | Organized data | --- Basic Info, --- Contact Details |
| **Subtables** (tabs) | Related records | Contacts, Opportunities, Contracts |

**Core entities: The first tab should have 2+ js_items + all fields grouped by section. The number of subtables determines additional tabs.**

### js_item desc rules

GOOD (specific): "4 Statistics side by side: opportunity count + total opportunity amount + contract count + total contract amount"
BAD (vague): "Customer profile" or "Progress display"

## Example: Customer Detail (richest)

```json
[
  {"title": "Overview",
   "fields": "--- Basic Info\nname|code\nindustry|source\ngrade|status\n--- Contact Details\nphone|email\ncity|address",
   "js_items": [
     {"title": "Customer Profile", "desc": "Large grade text (A/B/C/D) + colored status tag + industry tag + source tag + days since created"},
     {"title": "Business Summary", "desc": "4 Statistics side by side: opportunity count + total opportunity amount + contract count + total contract amount"}
   ]},
  {"title": "Contacts", "assoc": "contacts", "coll": "nb_crm_contacts",
   "fields": ["name","phone","email","position"]},
  {"title": "Opportunities", "assoc": "opportunities", "coll": "nb_crm_opportunities",
   "fields": ["title","amount","stage","probability"]},
  {"title": "Contracts", "assoc": "contracts", "coll": "nb_crm_contracts",
   "fields": ["code","title","amount","status","end_date"]}
]
```

## Example: Opportunity Detail

```json
[
  {"title": "Overview",
   "fields": "--- Basic Info\ntitle|customer\namount|probability\nstage\nexpected_date",
   "js_items": [
     {"title": "Opportunity Progress", "desc": "Stage progress bar (6 stages) + expected amount + probability + countdown"},
     {"title": "Amount Analysis", "desc": "Weighted amount (amount x probability)"}
   ]},
  {"title": "Quotes", "assoc": "quotes", "coll": "nb_crm_quotes",
   "fields": ["title","amount","status","valid_until"]},
  {"title": "Activity Log", "assoc": "activities", "coll": "nb_crm_activities",
   "fields": ["subject","type","follow_date","content"]}
]
```

## Example: Contract Detail

```json
[
  {"title": "Overview",
   "fields": "--- Contract Info\ncode|title\ncustomer\nstart_date|end_date\nstatus|amount",
   "js_items": [
     {"title": "Payment Progress", "desc": "Progress bar: received / total contract amount + outstanding amount + expiry countdown"},
     {"title": "Contract Status", "desc": "Large amount text + colored status tag + days remaining"}
   ]},
  {"title": "Line Items", "assoc": "items", "coll": "nb_crm_contract_items",
   "fields": ["product_name","quantity","unit_price","subtotal"]},
  {"title": "Payment Records", "assoc": "payments", "coll": "nb_crm_payments",
   "fields": ["code","amount","payment_date","status"]}
]
```

## Secondary entities (1 tab, 1 js_item)

Quotes, Payments, Approvals: A single "Overview" tab (all fields + 1 js_item) — no subtables so only 1 tab needed.

## Reference entities — skip (auto-generated default is fine)

Products, Knowledge Base, Competitors, Public Pool, Contract Line Items.

## Anti-patterns ❌

```json
// ❌ Wrong: Splitting fields from the same table into multiple tabs
[
  {"title": "Basic Info", "fields": "name|code"},
  {"title": "Contact Details", "fields": "phone|email"},
  {"title": "Work Info", "fields": "department|position"}
]

// ✅ Correct: One tab with Section dividers
[
  {"title": "Overview",
   "fields": "--- Basic Info\nname|code\n--- Contact Details\nphone|email\n--- Work Info\ndepartment|position",
   "js_items": [{"title": "Employee Profile", "desc": "Large name + department + position + days since hire + status tag"}]}
]
```
