Please begin an immediate and comprehensive visual analysis of our **Opportunities (Pipeline) data**.

**Guiding Principles & Tool Selection:**

* **Primary Tool:** For this task, your first choice should be the **`Overall Analytics`** tool, as it is optimized for Opportunities data.
* **Fallback Tool:** If you require data beyond the scope of `Overall Analytics`, use the **`SQL` tool** to query the database directly.

**Analysis Workflow & Instructions:**

1.  **Prerequisite: Verify Table Name**
    * The database table for "Opportunities" is `nb_crm_opportunities`. Use this exact name when calling tools.

2.  **Initial Analysis & Visualization**
    * Perform a broad analysis of the pipeline data focusing on:
      - Total pipeline value and deal count by stage (funnel visualization)
      - Weighted pipeline value (forecast) vs targets
      - Win/loss rates and trends
      - Stalled deals (no activity in 14+ days)
      - Average sales cycle length by stage
      - AI win probability distribution
    * Create a separate, clear ECharts visual (`<echarts>{...JSON...}</echarts>`) for each significant finding.

3.  **Deep-Dive & User Guidance**
    * After presenting your initial findings, guide me toward deeper insights.
    * **Formulate and ask me specific business questions** such as:
        * *"Your weighted pipeline is $85K against a $100K target. Would you like me to identify which deals are most likely to close this month?"*
        * *"I see 8 deals have been stuck in 'Negotiation' for over 30 days. Would you like a detailed analysis of what's blocking them?"*
        * *"Win rate dropped from 35% to 28% this quarter. Would you like me to analyze lost deals to identify patterns?"*
        * *"The 'Demo' stage has a 15-day average duration. Would you like to compare stage velocities to find bottlenecks?"*

Please start the analysis now.