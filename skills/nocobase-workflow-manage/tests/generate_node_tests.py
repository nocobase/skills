#!/usr/bin/env python3
"""
Script to generate test template files for all node types listed in nodes/index.md
"""

import os
import re
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).parent
NODES_DIR = BASE_DIR / "nodes"
REFERENCES_DIR = BASE_DIR.parent / "references" / "nodes"

# Read nodes/index.md to get node types
index_path = REFERENCES_DIR / "index.md"
with open(index_path, 'r') as f:
    content = f.read()

# Parse node types from the markdown table
# Looking for lines like: | `calculation` | Calculation | [calculation.md](calculation.md) |
node_types = []
lines = content.split('\n')
for line in lines:
    # Match table rows with backticks
    match = re.match(r'^\| `([^`]+)` \| ([^|]+) \| \[([^\]]+)\]\([^)]+\) \|', line.strip())
    if match:
        node_type = match.group(1)
        node_name = match.group(2).strip()
        node_doc = match.group(3)
        node_types.append((node_type, node_name, node_doc))

    # Also check for extension plugin nodes (second table)
    match = re.match(r'^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| \[([^\]]+)\]\([^)]+\) \|', line.strip())
    if match:
        node_type = match.group(1)
        node_name = match.group(2).strip()
        plugin = match.group(3).strip()
        node_doc = match.group(4)
        node_types.append((node_type, node_name, node_doc))

print(f"Found {len(node_types)} node types")

# Template for test files
TEST_TEMPLATE = """# {node_name} ({node_type}) Node Tests

## Overview
Tests for the `{node_type}` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-{uc_type}-001: Add {node_name} node
- **Description**: Add {node_name} node to workflow
- **Prompt**: "增加{node_name}节点"
- **Expected Configuration**:
```json
{{
  // Configuration based on {node_type} documentation
}}
```
- **Validation Points**:
  - Node type should be `{node_type}`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-{uc_type}-002: Modify existing {node_name} node
- **Description**: Update configuration of existing {node_name} node
- **Prompt**: "修改{node_name}节点的配置"
- **Expected Configuration** (updated):
```json
{{
  // Updated configuration
}}
```
- **Validation Points**:
  - Configuration should be updated
  - Node type unchanged
- **Test Steps**:
  1. Create workflow with {node_type} node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [{node_doc}]({node_doc}) for detailed configuration options.
"""

# Create nodes directory if it doesn't exist
NODES_DIR.mkdir(exist_ok=True)

# Generate test files for node types that don't exist yet
for node_type, node_name, node_doc in node_types:
    # Skip if file already exists
    test_file = NODES_DIR / f"{node_type}.md"
    if test_file.exists():
        print(f"Skipping {node_type} - file already exists")
        continue

    # Create uppercase version for test ID
    uc_type = node_type.upper().replace('-', '_')

    # Fill template
    content = TEST_TEMPLATE.format(
        node_type=node_type,
        node_name=node_name,
        uc_type=uc_type,
        node_doc=node_doc
    )

    # Write file
    with open(test_file, 'w') as f:
        f.write(content)

    print(f"Created {test_file}")

print("\nGeneration complete!")
print("Note: Generated test files contain placeholder configurations.")
print("You need to update each file with specific test cases based on the node documentation.")