Please begin an immediate and comprehensive visual analysis of our **Customers data**.

**Guiding Principles & Tool Selection:**

* **Primary Tool:** For this task, your first choice should be the **`Overall Analytics`** tool, as it is optimized for Customers data.
* **Fallback Tool:** If you require data beyond the scope of `Overall Analytics`, use the **`SQL` tool** to query the database directly.

**Analysis Workflow & Instructions:**

1.  **Prerequisite: Verify Table Name**
    * The database table for "Customers" is `nb_crm_customers`. Use this exact name when calling tools.

2.  **Initial Analysis & Visualization**
    * Perform a broad analysis of the customers data focusing on:
      - Customer distribution by industry, type, and tier level
      - Health score distribution across the customer base
      - Churn risk analysis (at-risk customers)
      - Revenue concentration (top customers vs long tail)
      - Customer growth trends over time
    * Create a separate, clear ECharts visual (`<echarts>{...JSON...}</echarts>`) for each significant finding.

3.  **Deep-Dive & User Guidance**
    * After presenting your initial findings, guide me toward deeper insights.
    * **Formulate and ask me specific business questions** such as:
        * *"Your top 5 customers represent 40% of revenue. Would you like me to analyze the engagement levels and health scores of these key accounts?"*
        * *"I see 12 customers flagged as 'at-risk'. Would you like a detailed breakdown of why they're at risk and recommended actions?"*
        * *"The Healthcare industry shows the fastest customer growth. Would you like to compare profitability across industries?"*

Please start the analysis now.