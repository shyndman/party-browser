# Testing Patterns

**Analysis Date:** 2026-02-09

## Test Framework

**Runner:** Node.js built-in test runner (`node:test`)

**Assertion Library:** Node.js built-in assertions (`node:assert`)

**Config:** No configuration file - uses CLI flags directly

**Run Commands:**
```bash
# Run all tests
node --test .opencode/get-shit-done/bin/gsd-tools.test.js

# Run specific test file
node gsd-tools.test.js
```

## Test File Organization

**Location:** Co-located with source files or in same directory as tested module

**Naming:** `[module-name].test.js` suffix

**Structure:**
```
.opencode/get-shit-done/bin/
├── gsd-tools.js        # Source file
└── gsd-tools.test.js   # Test file
```

## Test Structure

**Suite Organization:**
```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('command-name command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('descriptive test case name', () => {
    // Arrange
    const input = 'value';
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    assert.strictEqual(result, expected);
  });
});
```

**Patterns:**
- Group related tests with `describe()` blocks
- Use `beforeEach`/`afterEach` for setup/teardown
- Descriptive test names explaining expected behavior
- Test both success and error cases

## Mocking

**Framework:** None - uses real filesystem and child process execution

**Patterns:**
- Temporary directory pattern for isolation
- Real file operations in temp directories
- CLI tool invocation via `execSync`

**Example:**
```javascript
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Helper to run CLI command
function runGsdTools(args, cwd = process.cwd()) {
  try {
    const result = execSync(`node "${TOOLS_PATH}" ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}
```

**What to Mock:**
- Not applicable - tests use real filesystem

**What NOT to Mock:**
- File system operations (real temp directories)
- Child process execution (real CLI invocations)

## Fixtures and Factories

**Test Data:** Inline creation in tests

```javascript
test('nested frontmatter fields extracted correctly', () => {
  const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
  fs.mkdirSync(phaseDir, { recursive: true });

  const summaryContent = `---
phase: "01"
name: "Foundation Setup"
dependency-graph:
  provides:
    - "Database schema"
---

# Summary content here
`;

  fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), summaryContent);

  const result = runGsdTools('history-digest', tmpDir);
  // assertions...
});
```

**Factory Functions:**
- `createTempProject()` - Creates isolated temp directory
- `cleanup(tmpDir)` - Removes temp directory
- `runGsdTools(args, cwd)` - Executes CLI with error handling

## Coverage

**Requirements:** Not enforced

**View Coverage:** Not configured (no coverage tooling detected)

## Test Types

**Unit Tests:**
- Scope: Individual functions and CLI commands
- Approach: Real execution, temporary directories
- File: `gsd-tools.test.js`

**Integration Tests:**
- CLI command integration with filesystem
- Command chaining and state changes
- End-to-end workflow validation

**E2E Tests:** Not used

## Common Patterns

**Async Testing:**
```javascript
test('async operation succeeds', async () => {
  const result = await asyncFunction();
  assert.ok(result.success);
});
```

**Error Testing:**
```javascript
test('missing file returns error', () => {
  const result = runGsdTools('summary-extract nonexistent.md');
  assert.ok(result.success, 'Command should succeed');
  
  const output = JSON.parse(result.output);
  assert.strictEqual(output.error, 'File not found');
});
```

**JSON Output Validation:**
```javascript
test('returns valid JSON', () => {
  const result = runGsdTools('some-command');
  assert.ok(result.success);
  
  const output = JSON.parse(result.output);
  assert.strictEqual(output.someField, expectedValue);
  assert.deepStrictEqual(output.arrayField, [expected, values]);
});
```

**Partial Matching:**
```javascript
test('output contains expected string', () => {
  const result = runGsdTools('command');
  assert.ok(result.output.includes('expected text'));
});
```

**Error Message Testing:**
```javascript
test('provides helpful error message', () => {
  const result = runGsdTools('command-with-error');
  assert.ok(!result.success);
  assert.ok(result.error.includes('specific error detail'));
});
```

**State Change Verification:**
```javascript
test('creates expected files', () => {
  runGsdTools('init execute-phase 03');
  
  assert.ok(
    fs.existsSync(path.join(tmpDir, '.planning', 'phases', '03-api')),
    'directory should be created'
  );
});
```

## Test Utilities

**Custom Assertion Helpers:**
```javascript
// Command execution wrapper
function runGsdTools(args, cwd = process.cwd()) {
  try {
    const result = execSync(`node "${TOOLS_PATH}" ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}
```

**Test Isolation:**
- Each test gets fresh temp directory via `beforeEach`
- Cleanup runs after each test via `afterEach`
- Tests don't depend on execution order

## Where to Add New Tests

**New CLI Commands:**
- Add to existing `.opencode/get-shit-done/bin/gsd-tools.test.js`
- Create new `describe` block for command group
- Follow existing test patterns

**New Utility Functions:**
- Create `[filename].test.js` in same directory as source
- Use temp directory pattern for filesystem tests

**Testing Guidelines:**
1. Always clean up resources in `afterEach`
2. Use descriptive test names explaining behavior
3. Test edge cases (empty inputs, missing files, malformed data)
4. Test both success and error paths
5. Verify actual file system changes when applicable

---

*Testing analysis: 2026-02-09*
