"""NocoBase MCP Server — entry point.

Registers all tools from the tools/ directory and starts the MCP server.

Usage:
    nocobase-mcp                  # via installed script
    python -m nocobase_mcp.server # direct run

Environment variables:
    NB_URL       — NocoBase base URL (default: http://localhost:14000)
    NB_USER      — Login email (default: admin@nocobase.com)
    NB_PASSWORD   — Login password (default: admin123)
    NB_DB_URL    — PostgreSQL connection URL for SQL execution
                   (default: postgresql://nocobase:nocobase@localhost:5435/nocobase)
"""

from mcp.server.fastmcp import FastMCP

from .tools import collections, fields, routes, pages, page_tool, ai_employee, workflows, tree_tools

mcp = FastMCP(
    "nocobase",
    instructions="NocoBase MCP Server — atomic tools for data modeling, page building, and administration",
)

# Register all tool modules
collections.register_tools(mcp)
fields.register_tools(mcp)
routes.register_tools(mcp)
pages.register_tools(mcp)
page_tool.register_tools(mcp)
ai_employee.register_tools(mcp)
workflows.register_tools(mcp)
tree_tools.register_tools(mcp)


def main():
    """Run the MCP server (stdio transport)."""
    mcp.run()


if __name__ == "__main__":
    main()
