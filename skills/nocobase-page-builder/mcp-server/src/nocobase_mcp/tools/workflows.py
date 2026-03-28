"""Workflow tools — create, manage workflows and nodes.

Tools for creating automated workflows with triggers, conditions,
data operations, SQL, and HTTP requests.
"""

import json
from typing import Optional

from mcp.server.fastmcp import FastMCP

from ..client import get_nb_client
from ..utils import safe_json


def register_tools(mcp: FastMCP):
    """Register workflow tools on the MCP server."""

    @mcp.tool()
    def nb_create_workflow(
        title: str,
        trigger_type: str,
        trigger_config_json: str,
        sync: bool = False,
    ) -> str:
        """Create a workflow with a trigger.

        Args:
            title: Workflow title, e.g. "Auto-number Purchase Requests"
            trigger_type: Trigger type — "collection", "schedule", or "action"
            trigger_config_json: JSON object with trigger configuration.

                For collection trigger (data changes):
                    {"mode": 1, "collection": "my_table", "appends": [], "condition": {"$and": []}}
                    mode: 1=create, 2=update, 3=create+update, 4=delete
                    Add "changed": ["field1"] for update triggers to watch specific fields
                    Add "condition": {"status": {"$eq": "active"}} to filter triggering records

                For schedule trigger (cron):
                    {"mode": 0, "startsOn": "2026-01-01T00:00:00.000Z", "repeat": "0 9 * * 1-5"}

                For schedule trigger (date field):
                    {"mode": 1, "collection": "my_table",
                     "startsOn": {"field": "due_date", "offset": -7, "unit": 86400000},
                     "repeat": null, "appends": []}
                    offset: negative = days before, positive = days after

            sync: Run synchronously (default false). Use true for form-triggered flows.

        Returns:
            JSON with workflow id, key, title.

        Example:
            nb_create_workflow("Auto Status", "collection",
                '{"mode": 1, "collection": "orders", "appends": [], "condition": {"$and": []}}')
        """
        nb = get_nb_client()
        config = safe_json(trigger_config_json)
        wf = nb.workflow_create(title, trigger_type, config, sync=sync)
        if not wf:
            return json.dumps({"error": f"Failed to create workflow '{title}'"})
        return json.dumps({
            "id": wf.get("id"),
            "key": wf.get("key"),
            "title": wf.get("title"),
        })

    @mcp.tool()
    def nb_add_node(
        workflow_id: int,
        node_type: str,
        title: str,
        config_json: str,
        upstream_id: Optional[int] = None,
        branch_index: Optional[int] = None,
    ) -> str:
        """Add a node to a workflow.

        Nodes are linked automatically. If upstream_id is given, the node is
        placed after that node. If branch_index is also given, it starts a branch.

        Args:
            workflow_id: Workflow ID (from nb_create_workflow)
            node_type: Node type — one of:
                "condition" — branch logic (if/else)
                "update" — update records in a collection
                "create" — create a new record
                "query" — query records
                "sql" — execute raw SQL
                "request" — HTTP request
                "loop" — iterate over items
                "end" — terminate workflow (status: 1=success, 0=failure)
            title: Node display title
            config_json: JSON object with node configuration.

                condition (basic engine):
                    {"rejectOnFalse": false, "engine": "basic",
                     "calculation": {"group": {"type": "and", "calculations": [
                         {"calculator": "equal", "operands": ["{{$context.data.status}}", "active"]}
                     ]}}}

                condition (math.js):
                    {"engine": "math.js", "expression": "{{$context.data.qty}} > 0", "rejectOnFalse": false}

                update:
                    {"collection": "my_table",
                     "params": {"filter": {"id": "{{$context.data.id}}"}, "values": {"status": "done"}}}

                create:
                    {"collection": "my_table",
                     "params": {"values": {"name": "{{$context.data.name}}", "status": "new"}}}

                query:
                    {"collection": "my_table", "multiple": false,
                     "params": {"filter": {"id": "{{$context.data.ref_id}}"}}}

                sql:
                    {"dataSource": "main", "sql": "UPDATE my_table SET status='done' WHERE id={{$context.data.id}}"}

                request:
                    {"url": "https://api.example.com/hook", "method": "POST",
                     "contentType": "application/json", "data": "...", "timeout": 5000}

                loop:
                    {"target": "{{$context.data.items}}"}

                end:
                    {"endStatus": 1}

            upstream_id: ID of the upstream node to link after (omit for first node)
            branch_index: Branch index for condition/loop nodes:
                1 = true branch (condition) or loop body (loop)
                0 = false branch (condition)
                null = main line (default)

        Returns:
            JSON with node id, key, type.

        Variable system:
            {{$context.data.field}} — trigger record field
            {{$jobsMapByNodeKey.<nodeKey>.field}} — result from a previous node
            {{$scopes.<nodeKey>.item}} — current loop item

        Example (condition + branches):
            node = nb_add_node(wf_id, "condition", "Check Status",
                '{"rejectOnFalse":false,"engine":"basic","calculation":{"group":{"type":"and","calculations":[{"calculator":"equal","operands":["{{$context.data.status}}","active"]}]}}}')
            # Then add true branch:
            nb_add_node(wf_id, "update", "Set Active", '...', upstream_id=node_id, branch_index=1)
            # And false branch:
            nb_add_node(wf_id, "update", "Set Inactive", '...', upstream_id=node_id, branch_index=0)
        """
        nb = get_nb_client()
        config = safe_json(config_json)
        node = nb.workflow_node_create(
            workflow_id, node_type, title, config,
            upstream_id=upstream_id, branch_index=branch_index,
        )
        if not node:
            return json.dumps({"error": f"Failed to create node '{title}'"})
        return json.dumps({
            "id": node.get("id"),
            "key": node.get("key"),
            "type": node.get("type"),
        })

    @mcp.tool()
    def nb_enable_workflow(workflow_id: int, enabled: bool = True) -> str:
        """Enable or disable a workflow.

        Args:
            workflow_id: Workflow ID
            enabled: True to enable, False to disable

        Returns:
            Success/failure message.
        """
        nb = get_nb_client()
        ok = nb.workflow_update(workflow_id, {"enabled": enabled})
        action = "Enabled" if enabled else "Disabled"
        return f"{action} workflow {workflow_id}" if ok else f"Failed to {action.lower()} workflow {workflow_id}"

    @mcp.tool()
    def nb_list_workflows(
        enabled: Optional[bool] = None,
        prefix: Optional[str] = None,
    ) -> str:
        """List all workflows.

        Args:
            enabled: Filter by enabled status (true/false). Omit for all.
            prefix: Filter by title prefix, e.g. "AM-"

        Returns:
            JSON array of workflows with id, title, type, enabled, node count.
        """
        nb = get_nb_client()
        wfs = nb.workflow_list(enabled=enabled, prefix=prefix)
        summary = [
            {
                "id": w.get("id"),
                "title": w.get("title"),
                "type": w.get("type"),
                "enabled": w.get("enabled"),
                "collection": (w.get("config") or {}).get("collection", ""),
            }
            for w in wfs
        ]
        return json.dumps(summary, ensure_ascii=False)

    @mcp.tool()
    def nb_get_workflow(workflow_id: int) -> str:
        """Get workflow details including all nodes.

        Args:
            workflow_id: Workflow ID

        Returns:
            JSON with workflow info and nodes array.
        """
        nb = get_nb_client()
        wf, nodes = nb.workflow_get(workflow_id)
        if not wf:
            return json.dumps({"error": f"Workflow {workflow_id} not found"})
        node_summary = [
            {
                "id": n.get("id"),
                "key": n.get("key"),
                "type": n.get("type"),
                "title": n.get("title"),
                "upstreamId": n.get("upstreamId"),
                "downstreamId": n.get("downstreamId"),
                "branchIndex": n.get("branchIndex"),
            }
            for n in nodes
        ]
        return json.dumps({
            "id": wf.get("id"),
            "title": wf.get("title"),
            "type": wf.get("type"),
            "enabled": wf.get("enabled"),
            "config": wf.get("config"),
            "nodes": node_summary,
        }, ensure_ascii=False)

    @mcp.tool()
    def nb_delete_workflow(workflow_id: int) -> str:
        """Delete a workflow (auto-disables first).

        Args:
            workflow_id: Workflow ID to delete

        Returns:
            Success/failure message.
        """
        nb = get_nb_client()
        ok = nb.workflow_delete(workflow_id)
        return f"Deleted workflow {workflow_id}" if ok else f"Failed to delete workflow {workflow_id}"

    @mcp.tool()
    def nb_delete_workflows_by_prefix(prefix: str) -> str:
        """Delete all workflows whose title starts with a prefix.

        Useful for cleaning up demo/test workflows in batch.

        Args:
            prefix: Title prefix to match, e.g. "AM-" or "Test-"

        Returns:
            JSON with count of deleted workflows.
        """
        nb = get_nb_client()
        wfs = nb.workflow_list(prefix=prefix)
        deleted = 0
        for w in wfs:
            if nb.workflow_delete(w["id"]):
                deleted += 1
        return json.dumps({"deleted": deleted, "prefix": prefix})
