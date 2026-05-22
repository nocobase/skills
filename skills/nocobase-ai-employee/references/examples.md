# Examples

Load this file when a request needs classification examples or reusable task text.

## Example 1: Messy Text to Form

User intent: "Add an AI button to the customer form that extracts the name, phone number, and company from a pasted block of text and fills the form."

Decision:
- AI employee is appropriate because extraction from messy text is language-heavy.
- Reuse `dex` if visible.
- Place on create/edit form action.

Task:

```json
{
  "title": "Extract and fill customer fields",
  "message": {
    "system": "Use the current form context. Extract only facts present in the user's text. Do not invent values.",
    "user": "Extract customer information from the provided text and fill the matching form fields.",
    "workContext": [{ "type": "flow-model", "target": "self" }]
  },
  "autoSend": false,
  "skillSettings": null,
  "model": null,
  "webSearch": false
}
```

## Example 2: Table Insight Summary

User intent: "Add an AI analysis button to the order list that summarizes abnormal orders and recommended next steps from the current filtered results."

Decision:
- AI employee is appropriate if narrative analysis and recommendations are wanted.
- Reuse `viz`.
- Place on table block action, not record action.

Task:

```json
{
  "title": "Analyze filtered orders",
  "message": {
    "system": "Use the current table context. Summarize patterns, anomalies, and recommended next actions. Do not claim data that is not visible or available through tools.",
    "user": "Analyze the current filtered order list and summarize anomalies and next steps.",
    "workContext": [{ "type": "flow-model", "target": "self" }]
  },
  "autoSend": false,
  "skillSettings": null,
  "model": null,
  "webSearch": false
}
```

## Example 3: Deterministic Status Update

User intent: "Click a button to change the status to Processed."

Decision:
- AI employee is not appropriate.
- Use built-in update action or assignment configuration through `nocobase-ui-builder`.

## Example 4: Dedicated Contract Reviewer

User intent: "Add an AI review button to the contract detail page that identifies risk clauses, payment obligations, and renewal reminders. There is no employee like this in the system."

Decision:
- AI employee is appropriate.
- Create a business employee such as `contract-reviewer`.
- Place a record action on the details/table record surface.

Employee `about`:

```text
You are a contract review assistant for business users. Review contract records and attached text, identify risk clauses, payment obligations, renewal or termination dates, missing information, and recommended next actions. Use the user's language. Distinguish facts from assumptions. Do not provide legal advice; flag items that need legal review.
```

Action task:

```json
{
  "title": "Review contract risk",
  "message": {
    "system": "Use the current contract record context. Distinguish facts, risks, and recommended follow-up. Do not provide legal advice.",
    "user": "Review this contract record and summarize risk clauses, payment obligations, renewal reminders, and next actions.",
    "workContext": [{ "type": "flow-model", "target": "self" }]
  },
  "autoSend": false,
  "skillSettings": null,
  "model": null,
  "webSearch": false
}
```
