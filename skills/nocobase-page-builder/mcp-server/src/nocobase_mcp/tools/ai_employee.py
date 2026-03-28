"""AI Employee tools — create, manage, and integrate AI employees into pages.

Tools for managing AI employees (chatbot assistants) and embedding them
in NocoBase pages as floating avatars and action bar buttons.
"""

import json
from typing import Optional

from mcp.server.fastmcp import FastMCP

from ..client import get_nb_client
from ..utils import safe_json


def register_tools(mcp: FastMCP):
    """Register AI employee tools on the MCP server."""

    @mcp.tool()
    def nb_create_ai_employee(
        username: str,
        nickname: str,
        position: str,
        avatar: str,
        bio: str,
        about: str,
        greeting: str,
        skills_json: str,
        model_settings_json: Optional[dict] = None,
    ) -> str:
        """Create an AI employee (chatbot assistant).

        Args:
            username: Unique identifier (PK), e.g. "am-asset-keeper"
            nickname: Display name, e.g. "Asset Manager"
            position: Job title, e.g. "Asset Management Specialist"
            avatar: Avatar ID, e.g. "nocobase-015-male"
            bio: Short one-line description
            about: System prompt (role definition, instructions, data scope)
            greeting: Welcome message shown when chat starts
            skills_json: JSON array of skill bindings. Each item:
                {"name": "toolName", "autoCall": true/false}
                Common tools: dataModeling-getCollectionNames,
                dataModeling-getCollectionMetadata, dataSource-dataSourceQuery,
                dataSource-dataSourceCounting, frontend-formFiller
            model_settings_json: Optional JSON object with LLM settings.
                Default: gemini/gemini-2.5-flash, temperature=0.7

        Returns:
            JSON with created employee username.

        Example:
            nb_create_ai_employee("my-helper", "Assistant", "General Assistant",
                "nocobase-001-male", "General business assistant",
                "You are a general assistant...", "Hello! How can I help you?",
                '[{"name":"dataSource-dataSourceQuery","autoCall":true}]')
        """
        nb = get_nb_client()
        skills = safe_json(skills_json)
        model_settings = safe_json(model_settings_json) if model_settings_json else None
        result = nb.ai_employee_create(
            username, nickname, position, avatar, bio,
            about, greeting, skills, model_settings,
        )
        return json.dumps({"username": result})

    @mcp.tool()
    def nb_list_ai_employees() -> str:
        """List all AI employees.

        Returns:
            JSON array of AI employees with username, nickname, position, enabled.
        """
        nb = get_nb_client()
        employees = nb.ai_employee_list()
        summary = [
            {
                "username": e.get("username"),
                "nickname": e.get("nickname"),
                "position": e.get("position"),
                "enabled": e.get("enabled"),
                "avatar": e.get("avatar"),
            }
            for e in employees
        ]
        return json.dumps(summary, ensure_ascii=False)

    @mcp.tool()
    def nb_get_ai_employee(username: str) -> str:
        """Get AI employee details by username.

        Args:
            username: AI employee username (PK)

        Returns:
            JSON with full employee details.
        """
        nb = get_nb_client()
        emp = nb.ai_employee_get(username)
        return json.dumps(emp, ensure_ascii=False)

    @mcp.tool()
    def nb_update_ai_employee(username: str, values_json: str) -> str:
        """Update AI employee fields.

        Args:
            username: AI employee username
            values_json: JSON object with fields to update.
                Supports: about, greeting, bio, nickname, position,
                enabled, skillSettings, modelSettings, etc.

        Returns:
            Success/failure message.

        Example:
            nb_update_ai_employee("my-helper",
                '{"about":"Updated system prompt...","enabled":true}')
        """
        nb = get_nb_client()
        values = safe_json(values_json)
        ok = nb.ai_employee_update(username, values)
        return "Updated successfully" if ok else "Update failed"

    @mcp.tool()
    def nb_delete_ai_employee(username: str) -> str:
        """Delete an AI employee.

        Args:
            username: AI employee username to delete

        Returns:
            Success/failure message.
        """
        nb = get_nb_client()
        ok = nb.ai_employee_delete(username)
        return f"Deleted {username}" if ok else f"Failed to delete {username}"

    @mcp.tool()
    def nb_ai_shortcut(
        page_schema_uid: str,
        employees_json: str,
    ) -> str:
        """Create floating AI employee avatar shortcuts on a page.

        Places circular avatar buttons in the top-right corner of a page.
        Users click them to start a chat with the AI employee.

        Args:
            page_schema_uid: Tab schemaUid of the page (from nb_create_page)
            employees_json: JSON array of employee configs. Each item:
                {"username": "am-asset-keeper", "tasks": [
                    {"title": "Query Assets", "message": {"system": "...", "user": "..."}, "autoSend": false}
                ]}
                Tasks are optional preset conversation starters.

        Returns:
            JSON with container_uid.

        Example:
            nb_ai_shortcut("tab123",
                '[{"username":"am-asset-keeper","tasks":[{"title":"Query","message":{"user":"Help me look up assets"},"autoSend":false}]}]')
        """
        nb = get_nb_client()
        employees = safe_json(employees_json)
        container_uid = nb.ai_shortcut_list(page_schema_uid, employees)
        return json.dumps({"container_uid": container_uid})

    @mcp.tool()
    def nb_ai_button(
        block_uid: str,
        username: str,
        tasks_json: Optional[list] = None,
    ) -> str:
        """Create an AI employee button in a block's action bar.

        Adds an AI assistant button to a table or form block. Users click it
        to interact with the AI employee in the context of that block.

        Args:
            block_uid: UID of the block (TableBlockModel, CreateFormModel, etc.)
            username: AI employee username
            tasks_json: Optional JSON array of preset tasks:
                [{"title": "Analyze Data", "message": {"system": "...", "user": "..."}, "autoSend": false}]

        Returns:
            JSON with button_uid.

        Example:
            nb_ai_button("tbl123", "am-asset-keeper",
                '[{"title":"Query Assets","message":{"user":"Help me check current asset status"},"autoSend":false}]')
        """
        nb = get_nb_client()
        tasks = safe_json(tasks_json) if tasks_json else None
        button_uid = nb.ai_button(block_uid, username, tasks)
        return json.dumps({"button_uid": button_uid})
