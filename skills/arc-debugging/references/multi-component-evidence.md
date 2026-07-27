# Multi-component evidence gathering (Phase 1, step 4)

When a system has multiple components (CI → build → signing, API → service →
database), instrument each boundary and run once to see WHERE it breaks before
proposing any fix.

## Worked example (multi-layer signing)

```bash
# Layer 1: Workflow
echo "=== Secrets available in workflow: ==="
echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

# Layer 2: Build script
echo "=== Env vars in build script: ==="
env | grep IDENTITY || echo "IDENTITY not in environment"

# Layer 3: Signing script
echo "=== Keychain state: ==="
security list-keychains
security find-identity -v

# Layer 4: Actual signing
codesign --sign "$IDENTITY" --verbose=4 "$APP"
```

**This reveals:** which layer fails (secrets → workflow ✓, workflow → build ✗).
Analyze the evidence to identify the failing component, then investigate that
specific component.
