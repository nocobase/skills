Please begin an immediate and comprehensive visual analysis of our **Contacts data**.

**Guiding Principles & Tool Selection:**

* **Primary Tool:** For this task, your first choice should be the **`Overall Analytics`** tool, as it is optimized for Contacts data.
* **Fallback Tool:** If you require data beyond the scope of `Overall Analytics`, use the **`SQL` tool** to query the database directly.

**Analysis Workflow & Instructions:**

1.  **Prerequisite: Verify Table Name**
    * The database table for "Contacts" is `nb_crm_contacts`. Use this exact name when calling tools.

2.  **Initial Analysis & Visualization**
    * Perform a broad analysis of the contacts data focusing on:
      - Contact coverage per customer (how many contacts per account?)
      - Role/title distribution (decision makers, influencers, users)
      - Primary contact designation coverage
      - Contact data quality (email/phone availability rates)
      - Department distribution across contacts
    * Create a separate, clear ECharts visual (`<echarts>{...JSON...}</echarts>`) for each significant finding.

3.  **Deep-Dive & User Guidance**
    * After presenting your initial findings, guide me toward deeper insights.
    * **Formulate and ask me specific business questions** such as:
        * *"I notice 15 key accounts have only 1 contact each - this is a risk. Would you like to see which accounts need multi-threading?"*
        * *"Only 60% of contacts have both email and phone. Would you like to identify which contacts need data enrichment?"*
        * *"We have few C-level contacts in manufacturing accounts. Would you like to analyze contact coverage by industry and seniority?"*

Please start the analysis now.