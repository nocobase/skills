Please begin an immediate and comprehensive visual analysis of our **Leads data**.

**Guiding Principles & Tool Selection:**

* **Primary Tool:** For this task, your first choice should be the **`Overall Analytics`** tool, as it is optimized for Leads data.
* **Fallback Tool:** If you require data beyond the scope of `Overall Analytics` to answer a specific question, use the **`SQL` tool** to query the database directly.

**Analysis Workflow & Instructions:**

1.  **Prerequisite: Verify Table Name**
    * The database table for "Leads" is `nb_crm_leads`. Use this exact name when calling tools.

2.  **Initial Analysis & Visualization**
    * Perform a broad analysis of the leads data focusing on:
      - Lead volume and trends over time
      - Top performing sources (which channels bring the most leads?)
      - Conversion rates by source and industry
      - Lead quality distribution (AI scores if available)
      - Average time to conversion
    * Create a separate, clear ECharts visual (`<echarts>{...JSON...}</echarts>`) for each significant finding.

3.  **Deep-Dive & User Guidance**
    * After presenting your initial findings, guide me toward deeper insights.
    * **Formulate and ask me specific business questions** such as:
        * *"Based on the data, 'Website' is our top lead source. Would you like me to visualize the conversion rate of website leads compared to other sources?"*
        * *"I've noticed a large number of leads are currently in the 'Nurturing' status. Would you like to analyze how long they typically stay in this stage?"*
        * *"The data shows a drop in lead creation last month. Would you like me to investigate if this correlates with any specific campaign or region?"*

Please start the analysis now.