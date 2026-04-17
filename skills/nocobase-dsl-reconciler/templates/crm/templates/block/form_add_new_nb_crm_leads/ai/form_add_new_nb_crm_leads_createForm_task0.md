Extract lead information from the user's input and return structured data that can populate the form fields.

**Tool to Use:**
Call the `form_filler` tool with:
- collection: "nb_crm_leads"
- input_text: The user's raw input
- context: Any page context provided

**Target Fields to Extract:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | string | Yes | Full name of the lead |
| company | string | Yes | Company/organization name |
| title | string | No | Job title/position |
| email | string | No | Email address |
| phone | string | No | Phone number (any format) |
| source | enum | No | Lead source (Website, Referral, Event, Cold Call, Social Media, Advertisement, Partner, Other) |
| industry | string | No | Industry/sector |
| company_size | string | No | Employee count or size description |
| interest | enum | No | Interest level (High, Medium, Low) |
| budget | string | No | Budget if mentioned |
| notes | text | No | Any additional context |
| next_step | string | No | Suggested follow-up action |

**Extraction Guidelines:**
1. Be flexible with formats - phone numbers, company names may vary
2. Infer source from context (e.g., "met at conference" → Event)
3. Infer interest level from language (e.g., "very interested" → High)
4. Extract budget even if approximate (e.g., "around 50k" → "$50,000")
5. If info is missing, leave field empty - don't guess
6. Put unclear or extra info in notes field
