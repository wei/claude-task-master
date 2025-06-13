---
"task-master-ai": minor
---

Add an experimental automatic git branch-tag integration for seamless multi-context development

- **Automatic Tag Creation**: System now automatically creates empty tags when switching to new git branches
- **Branch-Tag Mapping**: Maintains mapping between git branches and task contexts for seamless workflow
- **Auto-Switch on Branch Change**: Task context automatically switches when you change git branches (when git workflow is enabled)
- **Isolated Task Contexts**: Each branch gets its own clean task context, preventing merge conflicts and enabling parallel development
- **Configuration Support**: Git workflow features can be enabled/disabled via `.taskmaster/config.json`
- **Zero Migration Impact**: Existing projects continue working unchanged with automatic migration to "master" tag
- **ES Module Compatibility**: Fixed git-utils module to work properly with ES module architecture
