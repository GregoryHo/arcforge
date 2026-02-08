# Sync Command Design Specification

## Problem Statement

DAG 與 Worktrees 之間缺乏同步機制，導致：
1. Worktree 內看不到整體 DAG 狀態
2. 依賴關係無法在 worktree 內檢查
3. 進度無法即時反映回 DAG
4. 跨 session 時 context 斷裂

## Design Goals

1. **Single Source of Truth** - DAG 仍是唯一真相，不複製
2. **Explicit Sync** - 顯式同步，不自動（可預測）
3. **Backward Compatible** - 舊格式 `.arcforge-epic` 仍可運作
4. **Minimal Overhead** - 輕量，不增加複雜流程

---

## Part 1: Extended `.arcforge-epic` Format

### Current Format (v1)
```
epic-auth
```
單純的 epic ID 文字檔。

### New Format (v2)
```yaml
# .arcforge-epic
version: 2

# Core identity (required)
epic: epic-auth
base_worktree: /Users/greg/project
base_branch: master

# Local state (updated in worktree)
local:
  status: in_progress      # pending | in_progress | review | done
  started_at: 2026-01-20T10:00:00
  features:
    total: 5
    done: 2
    current: feat-login    # currently working on

# Synced state (pulled from base DAG)
synced:
  last_sync: 2026-01-20T14:30:00
  dependencies:
    epic-core: completed
    epic-types: completed
  dependents:
    - epic-api
    - epic-ui
  blocked_by: []           # dependencies not yet completed
  dag_status: in_progress  # what DAG thinks this epic's status is
```

### Backward Compatibility

```python
def read_agentic_epic(path: Path) -> dict:
    """Read .arcforge-epic, supporting both v1 and v2 formats."""
    content = path.read_text().strip()

    # v1: plain text epic ID
    if not content.startswith('version:') and '\n' not in content:
        return {
            'version': 1,
            'epic': content,
            'base_worktree': None,
            'base_branch': None,
            'local': {'status': 'unknown'},
            'synced': None,
        }

    # v2: YAML format
    data = yaml.safe_load(content)
    return data
```

---

## Part 2: `arcforge sync` Command

### Command Modes

```
arcforge sync [--from-base | --to-base | --both]
```

| Flag | Location | Action |
|------|----------|--------|
| `--from-base` | Worktree | Pull DAG state → update `.arcforge-epic` synced section |
| `--to-base` | Worktree | Push local state → update DAG |
| `--both` | Worktree | Both directions (default) |
| (no flag) | Base | Scan all worktrees → update DAG |

### Behavior by Location

#### In Worktree: `sync --from-base`

```
┌─────────────────────────────────────────────────────────────────┐
│  Input: .arcforge-epic (epic ID), base_worktree path             │
│  Output: Updated .arcforge-epic with synced section              │
└─────────────────────────────────────────────────────────────────┘

1. Find base worktree (via git worktree list or .arcforge-epic.base_worktree)
2. Read base's dag.yaml
3. Find this epic in DAG
4. Extract:
   - This epic's dependencies and their statuses
   - This epic's dependents (who depends on this)
   - Overall DAG status for this epic
5. Update .arcforge-epic synced section
6. Report:
   ✅ Synced from base
   Dependencies: epic-core (completed), epic-types (completed)
   Blocked by: none
   Dependents waiting: epic-api, epic-ui
```

#### In Worktree: `sync --to-base`

```
┌─────────────────────────────────────────────────────────────────┐
│  Input: .arcforge-epic with local section                        │
│  Output: Updated dag.yaml in base                               │
└─────────────────────────────────────────────────────────────────┘

1. Read .arcforge-epic local section
2. Find base worktree
3. Update dag.yaml:
   - Epic status if changed
   - Feature progress if tracked
4. Report:
   ✅ Synced to base
   Updated: epic-auth status → in_progress
```

#### In Base: `sync`

```
┌─────────────────────────────────────────────────────────────────┐
│  Input: dag.yaml, .worktrees/*/                                 │
│  Output: Updated dag.yaml with worktree states                  │
└─────────────────────────────────────────────────────────────────┘

1. List all .worktrees/*
2. For each worktree:
   - Read .arcforge-epic
   - Extract local status
3. Update dag.yaml with collected states
4. Report:
   ✅ Synced 3 worktrees
   epic-auth: in_progress (2/5 features)
   epic-api: pending (blocked by: epic-auth)
   epic-ui: in_progress (0/3 features)
```

---

## Part 3: Coordinator Class Changes

### New Methods

```python
class Coordinator:

    def sync(
        self,
        direction: Literal['from_base', 'to_base', 'both', 'scan'] = 'both'
    ) -> SyncResult:
        """
        Synchronize state between worktree and base DAG.

        Args:
            direction:
                - 'from_base': Pull DAG state into .arcforge-epic
                - 'to_base': Push local state to DAG
                - 'both': Both directions (default for worktree)
                - 'scan': Scan all worktrees (default for base)

        Returns:
            SyncResult with details of what was synced
        """
        if self._is_in_worktree():
            if direction == 'scan':
                raise ValueError("Cannot scan from worktree, use from_base/to_base/both")
            return self._sync_worktree(direction)
        else:
            if direction in ('from_base', 'to_base', 'both'):
                raise ValueError("Cannot sync from/to base when in base, use scan")
            return self._sync_base()

    def _sync_worktree(self, direction: str) -> SyncResult:
        """Sync when inside a worktree."""
        epic_file = self._read_agentic_epic_v2()
        base_path = self._find_base_worktree()

        result = SyncResult(epic_id=epic_file['epic'])

        if direction in ('from_base', 'both'):
            # Pull from base DAG
            base_coord = Coordinator(base_path)
            dag_epic = base_coord.dag.get_epic(epic_file['epic'])

            epic_file['synced'] = {
                'last_sync': datetime.now().isoformat(),
                'dependencies': self._get_dependency_statuses(base_coord.dag, dag_epic),
                'dependents': self._get_dependents(base_coord.dag, dag_epic),
                'blocked_by': self._get_blocked_by(base_coord.dag, dag_epic),
                'dag_status': dag_epic.status.value,
            }
            result.pulled = True

        if direction in ('to_base', 'both'):
            # Push to base DAG
            base_coord = Coordinator(base_path)
            local = epic_file.get('local', {})
            if local.get('status'):
                # Update DAG with local status
                dag_epic = base_coord.dag.get_epic(epic_file['epic'])
                if dag_epic and local['status'] != dag_epic.status.value:
                    dag_epic.status = TaskStatus(local['status'])
                    base_coord._save_dag()
                    result.pushed = True

        self._write_agentic_epic_v2(epic_file)
        return result

    def _sync_base(self) -> SyncResult:
        """Sync when in base: scan all worktrees."""
        worktrees_dir = self.project_root / '.worktrees'
        if not worktrees_dir.exists():
            return SyncResult(scanned=0)

        result = SyncResult(scanned=0, updates=[])

        for worktree_path in worktrees_dir.iterdir():
            if not worktree_path.is_dir():
                continue

            epic_file_path = worktree_path / '.arcforge-epic'
            if not epic_file_path.exists():
                continue

            epic_data = self._read_agentic_epic_v2(epic_file_path)
            local = epic_data.get('local', {})

            # Find epic in DAG
            dag_epic = self.dag.get_epic(epic_data['epic'])
            if dag_epic and local.get('status'):
                if local['status'] != dag_epic.status.value:
                    dag_epic.status = TaskStatus(local['status'])
                    result.updates.append({
                        'epic': epic_data['epic'],
                        'old_status': dag_epic.status.value,
                        'new_status': local['status'],
                    })

            result.scanned += 1

        if result.updates:
            self._save_dag()

        return result

    def _is_in_worktree(self) -> bool:
        """Check if current project_root is inside .worktrees/"""
        return '.worktrees' in self.project_root.parts

    def _read_agentic_epic_v2(self, path: Optional[Path] = None) -> dict:
        """Read .arcforge-epic supporting v1 and v2 formats."""
        path = path or (self.project_root / '.arcforge-epic')
        content = path.read_text().strip()

        # v1: plain text
        if not content.startswith('version:') and '\n' not in content:
            return {
                'version': 1,
                'epic': content,
                'base_worktree': str(self._find_base_worktree()),
                'base_branch': self._infer_base_branch(),
                'local': {'status': 'in_progress'},
                'synced': None,
            }

        # v2: YAML
        return yaml.safe_load(content)

    def _write_agentic_epic_v2(self, data: dict) -> None:
        """Write .arcforge-epic in v2 format."""
        data['version'] = 2
        path = self.project_root / '.arcforge-epic'
        path.write_text(yaml.dump(data, sort_keys=False))

    def _get_dependency_statuses(self, dag: DAG, epic: Epic) -> dict[str, str]:
        """Get status of all dependencies for an epic."""
        return {
            dep_id: dag.get_epic(dep_id).status.value
            for dep_id in epic.depends_on
            if dag.get_epic(dep_id)
        }

    def _get_dependents(self, dag: DAG, epic: Epic) -> list[str]:
        """Get list of epics that depend on this epic."""
        return [
            e.id for e in dag.epics
            if epic.id in e.depends_on
        ]

    def _get_blocked_by(self, dag: DAG, epic: Epic) -> list[str]:
        """Get dependencies that are not yet completed."""
        return [
            dep_id for dep_id in epic.depends_on
            if dag.get_epic(dep_id) and
               dag.get_epic(dep_id).status != TaskStatus.COMPLETED
        ]
```

### SyncResult Model

```python
@dataclass
class SyncResult:
    epic_id: Optional[str] = None
    pulled: bool = False
    pushed: bool = False
    scanned: int = 0
    updates: list[dict] = field(default_factory=list)
    blocked_by: list[str] = field(default_factory=list)
    dependents: list[str] = field(default_factory=list)
```

---

## Part 4: CLI Integration

### New Command

```python
# In cli.py

@app.command()
def sync(
    direction: str = typer.Option(
        'auto',
        '--direction', '-d',
        help='Sync direction: from-base, to-base, both, scan, or auto'
    )
) -> None:
    """Synchronize state between worktree and base DAG."""
    coord = Coordinator(Path.cwd())

    if direction == 'auto':
        direction = 'scan' if not coord._is_in_worktree() else 'both'

    result = coord.sync(direction=direction.replace('-', '_'))

    if result.scanned:
        typer.echo(f"✅ Synced {result.scanned} worktrees")
        for update in result.updates:
            typer.echo(f"  {update['epic']}: {update['old_status']} → {update['new_status']}")
    else:
        typer.echo(f"✅ Synced epic: {result.epic_id}")
        if result.pulled:
            typer.echo(f"  Pulled from base DAG")
            if result.blocked_by:
                typer.echo(f"  ⚠️  Blocked by: {', '.join(result.blocked_by)}")
            else:
                typer.echo(f"  Ready to proceed")
        if result.pushed:
            typer.echo(f"  Pushed to base DAG")
```

### Usage Examples

```bash
# In worktree: sync both directions (default)
$ cd .worktrees/epic-auth
$ arcforge sync
✅ Synced epic: epic-auth
  Pulled from base DAG
  Ready to proceed
  Pushed to base DAG

# In worktree: only pull from base
$ arcforge sync --direction from-base
✅ Synced epic: epic-auth
  Pulled from base DAG
  Dependencies: epic-core (completed)
  Dependents waiting: epic-api, epic-ui

# In base: scan all worktrees
$ cd /project
$ arcforge sync
✅ Synced 3 worktrees
  epic-auth: pending → in_progress
  epic-api: (no change)
  epic-ui: (no change)
```

---

## Part 5: Skill Integration

### arc-coordinating Updates

Add sync to command table:

```markdown
| Command | Purpose | CLI Mapping |
|---------|---------|-------------|
| `expand` | Create worktrees for ready epics | `arcforge expand` |
| `merge` | Merge completed epics | `arcforge merge` |
| `status` | Show pipeline progress | `arcforge status` |
| `cleanup` | Remove merged worktrees | `arcforge cleanup` |
| `sync` | Synchronize worktree ↔ DAG | `arcforge sync` |
| `reboot` | Generate 5-Question context | `arcforge reboot` |
```

### arc-implementing Updates

Add sync to workflow:

```markdown
## Starting Work in a Worktree

Before starting implementation:

1. **Sync from base** to check dependencies:
   ```bash
   arcforge sync --direction from-base
   ```

2. If blocked_by is not empty, STOP and report:
   ```
   ⚠️ Cannot start: waiting for dependencies
   Blocked by: epic-core, epic-types
   ```

3. If ready, proceed with implementation.
```

### arc-finishing-epic Updates

Add sync before and after:

```markdown
### Step 0.5: Sync Before Finish (NEW)

```bash
arcforge sync --direction from-base
```

Verify no dependency changes since last sync.

### Step 4.5: Sync After Choice (NEW)

After executing any option except "Keep":

```bash
arcforge sync --direction to-base
```

Ensure DAG reflects the new status.
```

---

## Part 6: Migration Plan

### Phase 1: Add v2 Format Support (Non-Breaking)

1. Add `_read_agentic_epic_v2()` with backward compatibility
2. Add `_write_agentic_epic_v2()`
3. Existing v1 files continue to work

### Phase 2: Add Sync Command

1. Implement `sync()` method in Coordinator
2. Add CLI command
3. Update skills documentation

### Phase 3: Upgrade expand to Write v2

1. Modify `expand_worktrees()` to write v2 format
2. Include base_worktree and base_branch

### Phase 4: Auto-Sync on Key Operations

1. `merge` → auto sync to base after merge
2. `status` → auto sync from all worktrees first

---

## Part 7: Testing Plan

### Unit Tests

```python
def test_read_agentic_epic_v1():
    """v1 format should be read correctly."""

def test_read_agentic_epic_v2():
    """v2 format should be read correctly."""

def test_sync_from_base_updates_dependencies():
    """Sync from base should update dependency statuses."""

def test_sync_to_base_updates_dag():
    """Sync to base should update DAG status."""

def test_sync_scan_collects_all_worktrees():
    """Sync in base should scan all worktrees."""
```

### Integration Tests

```python
def test_full_workflow_with_sync():
    """
    1. Create DAG with dependencies
    2. Expand worktrees
    3. Sync in worktree (should see dependencies)
    4. Update local status
    5. Sync to base
    6. Verify DAG updated
    """
```

---

## Summary

| Component | Change |
|-----------|--------|
| `.arcforge-epic` | Extend to YAML v2 with local/synced sections |
| `Coordinator` | Add `sync()`, `_read_agentic_epic_v2()`, `_write_agentic_epic_v2()` |
| CLI | Add `arcforge sync` command |
| Skills | Update coordinator, implementer, finish-epic |
| Tests | Add unit + integration tests |
