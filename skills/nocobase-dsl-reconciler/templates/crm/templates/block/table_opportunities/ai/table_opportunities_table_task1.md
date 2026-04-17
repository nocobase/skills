Please begin an immediate and comprehensive visual analysis of our **Quotations data**.

**Guiding Principles & Tool Selection:**

* **Primary Tool:** For this task, your first choice should be the **`Overall Analytics`** tool, as it is optimized for Quotations data.
* **Fallback Tool:** If you require data beyond the scope of `Overall Analytics`, use the **`SQL` tool** to query the database directly.

**Analysis Workflow & Instructions:**

1.  **Prerequisite: Verify Table Name**
    * The database table for "Quotations" is `nb_crm_quotations`. Use this exact name when calling tools.

2.  **Initial Analysis & Visualization**
    * Perform a broad analysis of the quotations data focusing on:
      - Quote volume and total value
      - Status funnel (draft → sent → viewed → accepted/rejected)
      - Quote-to-order win rate
      - Average discount rates applied
      - Quote-to-order conversion time
      - Quotes expiring soon (within 7 days)
    * Create a separate, clear ECharts visual (`<echarts>{...JSON...}</echarts>`) for each significant finding.

3.  **Deep-Dive & User Guidance**
    * After presenting your initial findings, guide me toward deeper insights.
    * **Formulate and ask me specific business questions** such as:
        * *"You have 5 quotes worth $120K expiring this week. Would you like me to list them with customer contact details for follow-up?"*
        * *"Win rate on quotes over $50K is only 20% vs 45% for smaller quotes. Would you like to analyze why large deals are harder to close?"*
        * *"Average discount is 12% but top performers give only 8%. Would you like to see discount patterns by sales rep?"*
        * *"Quotes that are viewed within 24 hours have 3x higher win rate. Would you like to track quote engagement metrics?"*

Please start the analysis now.