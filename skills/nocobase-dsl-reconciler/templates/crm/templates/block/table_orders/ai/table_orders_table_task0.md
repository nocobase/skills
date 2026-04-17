Please begin an immediate and comprehensive visual analysis of our **Orders data**.

**Guiding Principles & Tool Selection:**

* **Primary Tool:** For this task, your first choice should be the **`Overall Analytics`** tool, as it is optimized for Orders data.
* **Fallback Tool:** If you require data beyond the scope of `Overall Analytics`, use the **`SQL` tool** to query the database directly.

**Analysis Workflow & Instructions:**

1.  **Prerequisite: Verify Table Name**
    * The database table for "Orders" is `nb_crm_orders`. Use this exact name when calling tools.

2.  **Initial Analysis & Visualization**
    * Perform a broad analysis of the orders data focusing on:
      - Total orders and revenue (current period vs previous)
      - Order status distribution (pending, confirmed, shipped, delivered)
      - Payment collection status and outstanding amounts
      - Monthly/quarterly revenue trends
      - Top customers by order value
      - Delivery performance metrics
    * Create a separate, clear ECharts visual (`<echarts>{...JSON...}</echarts>`) for each significant finding.

3.  **Deep-Dive & User Guidance**
    * After presenting your initial findings, guide me toward deeper insights.
    * **Formulate and ask me specific business questions** such as:
        * *"Revenue is up 15% but order count is flat - average order value increased. Would you like to analyze which products or customers are driving this?"*
        * *"You have $45K in unpaid invoices over 30 days. Would you like a breakdown by customer with recommended collection actions?"*
        * *"Delivery delays increased this month. Would you like to correlate this with specific product categories or shipping methods?"*
        * *"Your top 3 customers haven't ordered in 60 days. Would you like me to flag these for proactive outreach?"*

Please start the analysis now.