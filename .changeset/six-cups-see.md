---
"task-master-ai": minor
---

Implements core tagged task lists system with full CLI support

This release adds tagged task lists for multi-context task management, enabling users to organize tasks into separate contexts like "master", "feature-branch", teammate names or "v2" without conflicts.

**New Features:**

- **Complete Tag Management CLI**: Full suite of tag commands (`tags`, `add-tag`, `delete-tag`, `use-tag`, `rename-tag`, `copy-tag`)
- **Tagged Task Lists**: Organize tasks into separate contexts with complete isolation between tags
- **Seamless Migration**: Existing projects automatically migrate to use a "master" tag with zero disruption
- **Enhanced Delete Confirmation**: Double confirmation with inquirer prompts for destructive tag operations
- **Master Tag Metadata**: Automatic metadata enhancement for existing tags with creation dates and descriptions
- **Dynamic Task Counting**: Real-time task count calculation without stored counters
- **Full Terminal Width Tables**: Responsive table layouts that adapt to terminal size
- **Backward Compatibility**: All existing commands continue to work exactly as before

**Tag Management Commands:**

- `task-master tags [--show-metadata]` - List all available tags with task counts and metadata
- `task-master add-tag <name> [--copy-from-current] [--copy-from=<tag>] [-d="<desc>"]` - Create new tag contexts
- `task-master delete-tag <name> [--yes]` - Delete tags with double confirmation (changed from `--force` to `--yes`)
- `task-master use-tag <name>` - Switch between tag contexts
- `task-master rename-tag <old> <new>` - Rename existing tags
- `task-master copy-tag <source> <target> [-d="<desc>"]` - Copy tags to create new contexts

**Migration & Compatibility:**

- Existing `tasks.json` files are automatically migrated to tagged format
- Master tag gets proper metadata (creation date, description) during migration
- All existing workflows continue unchanged
- Silent migration with user-friendly notifications

