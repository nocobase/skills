Please begin an immediate and comprehensive visual analysis of our **Activities data**.

**Guiding Principles & Tool Selection:**

* **Primary Tool:** For this task, your first choice should be the **`Overall Analytics`** tool, as it is optimized for Activities data.
* **Fallback Tool:** If you require data beyond the scope of `Overall Analytics`, use the **`SQL` tool** to query the database directly.

**Analysis Workflow & Instructions:**

1.  **Prerequisite: Verify Table Name**
    * The database table for "Activities" is `nb_crm_activities`. Use this exact name when calling tools.

2.  **Initial Analysis & Visualization**
    * Perform a broad analysis of the activities data focusing on:
      - Activity volume by type (calls, meetings, emails, tasks)
      - Completion rates and overdue activities
      - Activity trends over time (weekly/monthly patterns)
      - Productivity by user/sales rep
      - Activity coverage on active opportunities
      - Sentiment distribution (if available)
    * Create a separate, clear ECharts visual (`<echarts>{...JSON...}</echarts>`) for each significant finding.

3.  **Deep-Dive & User Guidance**
    * After presenting your initial findings, guide me toward deeper insights.
    * **Formulate and ask me specific business questions** such as:
        * *"Activity volume dropped 25% last week. Would you like me to break this down by rep to see who needs support?"*
        * *"You have 15 overdue follow-up tasks. Would you like to see which opportunities these are linked to and prioritize them?"*
        * *"Calls have the highest conversion impact but represent only 20% of activities. Would you like to analyze optimal activity mix?"*
        * *"3 opportunities have had no activity in 2 weeks. Would you like me to flag these as at-risk?"*

Please start the analysis now.