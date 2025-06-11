---
"task-master-ai": minor
---

Introduces tagged task lists for multi-context task management

This release adds support for organizing tasks into separate lists (tags) to enable working across multiple contexts such as different branches, environments, or project phases without conflicts.

**New Features:**

- **Tagged Task Lists**: Organize tasks into separate contexts with tags like "master", "feature-branch", or "v2.0"
- **Seamless Migration**: Existing projects automatically migrate to use a "master" tag with zero disruption
- **Backward Compatibility**: All existing commands continue to work exactly as before
- **Tag Management**: Commands to create, switch between, and manage different task contexts
- **Git Integration**: Automatically create tags based on git branch names
- **Context Isolation**: Tasks in different tags are completely separate and isolated

**Migration:**

- Existing `tasks.json` files are automatically migrated to the new tagged format
- Your tasks will appear under the "master" tag by default
- No action required - migration happens transparently on first use
- All existing workflows continue to work unchanged

**Coming in Part 2:**

- CLI commands for tag management (`add-tag`, `use-tag`, `list-tags`)
- MCP tool support for tag operations
- Enhanced git branch integration
- Tag switching and context management
