# Skill Authoring Best Practices

> Learn how to write effective Skills that Claude can discover and use successfully.

Good Skills are concise, well-structured, and tested with real usage. This guide provides practical authoring decisions to help you write Skills that Claude can discover and use effectively.

## Core Principles

### Concise is Key

The context window is a public good. Your Skill shares the context window with everything else Claude needs to know, including:

* The system prompt
* Conversation history
* Other Skills' metadata
* Your actual request

Not every token in your Skill has an immediate cost. At startup, only the metadata (name and description) from all Skills is pre-loaded. Claude reads SKILL.md only when the Skill becomes relevant, and reads additional files only as needed. However, being concise in SKILL.md still matters: once Claude loads it, every token competes with conversation history and other context.

**Default assumption**: Claude is already very smart

Only add context Claude doesn't already have. Challenge each piece of information:

* "Does Claude really need this explanation?"
* "Can I assume Claude knows this?"
* "Does this paragraph justify its token cost?"

**Good example: Concise** (approximately 50 tokens):

```markdown
## Extract PDF text

Use pdfplumber for text extraction:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
```

**Bad example: Too verbose** (approximately 150 tokens):

```markdown
## Extract PDF text

PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available for PDF processing, but we
recommend pdfplumber because it's easy to use and handles most cases well.
First, you'll need to install it using pip. Then you can use the code below...
```

The concise version assumes Claude knows what PDFs are and how libraries work.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability.

**High freedom** (text-based instructions):

Use when:

* Multiple approaches are valid
* Decisions depend on context
* Heuristics guide the approach

**Medium freedom** (pseudocode or scripts with parameters):

Use when:

* A preferred pattern exists
* Some variation is acceptable
* Configuration affects behavior

**Low freedom** (specific scripts, few or no parameters):

Use when:

* Operations are fragile and error-prone
* Consistency is critical
* A specific sequence must be followed

**Analogy**: Think of Claude as a robot exploring a path:

* **Narrow bridge with cliffs on both sides**: There's only one safe way forward. Provide specific guardrails and exact instructions (low freedom). Example: database migrations that must run in exact sequence.
* **Open field with no hazards**: Many paths lead to success. Give general direction and trust Claude to find the best route (high freedom). Example: code reviews where context determines the best approach.

### Test with All Models You Plan to Use

Skills act as additions to models, so effectiveness depends on the underlying model. Test your Skill with all the models you plan to use it with.

**Testing considerations by model**:

* **Claude Haiku** (fast, economical): Does the Skill provide enough guidance?
* **Claude Sonnet** (balanced): Is the Skill clear and efficient?
* **Claude Opus** (powerful reasoning): Does the Skill avoid over-explaining?

What works perfectly for Opus might need more detail for Haiku.

## Skill Structure

### YAML Frontmatter

The SKILL.md frontmatter supports two fields:

* `name` - Human-readable name of the Skill (64 characters maximum)
* `description` - One-line description of what the Skill does and when to use it (1024 characters maximum)

### Naming Conventions

Use consistent naming patterns. We recommend using **gerund form** (verb + -ing) for Skill names.

**Good naming examples (gerund form)**:

* "Processing PDFs"
* "Analyzing spreadsheets"
* "Managing databases"
* "Testing code"
* "Writing documentation"

**Avoid**:

* Vague names: "Helper", "Utils", "Tools"
* Overly generic: "Documents", "Data", "Files"
* Inconsistent patterns within your skill collection

### Writing Effective Descriptions

The `description` field enables Skill discovery and should include both what the Skill does and when to use it.

**Always write in third person**. The description is injected into the system prompt, and inconsistent point-of-view can cause discovery problems.

* **Good:** "Processes Excel files and generates reports"
* **Avoid:** "I can help you process Excel files"
* **Avoid:** "You can use this to process Excel files"

**Be specific and include key terms**. Include both what the Skill does and specific triggers/contexts for when to use it.

### Progressive Disclosure Patterns

SKILL.md serves as an overview that points Claude to detailed materials as needed.

**Practical guidance:**

* Keep SKILL.md body under 500 lines for optimal performance
* Split content into separate files when approaching this limit

**Example structure:**

```
pdf/
├── SKILL.md              # Main instructions (loaded when triggered)
├── FORMS.md              # Form-filling guide (loaded as needed)
├── reference.md          # API reference (loaded as needed)
├── examples.md           # Usage examples (loaded as needed)
└── scripts/
    ├── analyze_form.py   # Utility script (executed, not loaded)
    ├── fill_form.py      # Form filling script
    └── validate.py       # Validation script
```

### Avoid Deeply Nested References

Claude may partially read files when they're referenced from other referenced files. **Keep references one level deep from SKILL.md**.

**Bad example: Too deep**:

```markdown
# SKILL.md
See [advanced.md](advanced.md)...

# advanced.md
See [details.md](details.md)...

# details.md
Here's the actual information...
```

**Good example: One level deep**:

```markdown
# SKILL.md

**Basic usage**: [instructions in SKILL.md]
**Advanced features**: See [advanced.md](advanced.md)
**API reference**: See [reference.md](reference.md)
**Examples**: See [examples.md](examples.md)
```

### Structure Longer Reference Files with Table of Contents

For reference files longer than 100 lines, include a table of contents at the top.

## Workflows and Feedback Loops

### Use Workflows for Complex Tasks

Break complex operations into clear, sequential steps. For particularly complex workflows, provide a checklist that Claude can copy into its response and check off as it progresses.

**Example:**

```markdown
## PDF form filling workflow

Copy this checklist and check off items as you complete them:

- [ ] Step 1: Analyze the form (run analyze_form.py)
- [ ] Step 2: Create field mapping (edit fields.json)
- [ ] Step 3: Validate mapping (run validate_fields.py)
- [ ] Step 4: Fill the form (run fill_form.py)
- [ ] Step 5: Verify output (run verify_output.py)
```

Clear steps prevent Claude from skipping critical validation.

### Implement Feedback Loops

**Common pattern**: Run validator → fix errors → repeat

This pattern greatly improves output quality.

## Content Guidelines

### Avoid Time-Sensitive Information

Don't include information that will become outdated.

### Use Consistent Terminology

Choose one term and use it throughout the Skill:

**Good - Consistent**:

* Always "API endpoint"
* Always "field"
* Always "extract"

**Bad - Inconsistent**:

* Mix "API endpoint", "URL", "API route", "path"
* Mix "field", "box", "element", "control"

## Common Patterns

### Template Pattern

Provide templates for output format. Match the level of strictness to your needs.

### Examples Pattern

For Skills where output quality depends on seeing examples, provide input/output pairs.

### Conditional Workflow Pattern

Guide Claude through decision points with clear branching.

## Evaluation and Iteration

### Build Evaluations First

**Create evaluations BEFORE writing extensive documentation.** This ensures your Skill solves real problems rather than documenting imagined ones.

**Evaluation-driven development:**

1. **Identify gaps**: Run Claude on representative tasks without a Skill
2. **Create evaluations**: Build three scenarios that test these gaps
3. **Establish baseline**: Measure Claude's performance without the Skill
4. **Write minimal instructions**: Create just enough content to address the gaps
5. **Iterate**: Execute evaluations, compare against baseline, and refine

### Develop Skills Iteratively with Claude

Work with one instance of Claude ("Claude A") to create a Skill that will be used by other instances ("Claude B"). Claude A helps you design and refine instructions, while Claude B tests them in real tasks.

**Creating a new Skill:**

1. **Complete a task without a Skill**: Work through a problem with Claude A
2. **Identify the reusable pattern**: What context would be useful for similar future tasks
3. **Ask Claude A to create a Skill**: Capture the pattern
4. **Review for conciseness**: Remove unnecessary explanations
5. **Test on similar tasks**: Use the Skill with Claude B
6. **Iterate based on observation**: Return to Claude A with specifics

## Anti-Patterns to Avoid

### Avoid Windows-Style Paths

Always use forward slashes in file paths, even on Windows:

* Good: `scripts/helper.py`, `reference/guide.md`
* Avoid: `scripts\helper.py`, `reference\guide.md`

### Avoid Offering Too Many Options

Don't present multiple approaches unless necessary. Provide a default with an escape hatch.

## Advanced: Skills with Executable Code

### Solve, Don't Punt

When writing scripts for Skills, handle error conditions rather than punting to Claude.

### Provide Utility Scripts

Even if Claude could write a script, pre-made scripts offer advantages:

* More reliable than generated code
* Save tokens (no need to include code in context)
* Save time (no code generation required)
* Ensure consistency across uses

### Create Verifiable Intermediate Outputs

When Claude performs complex, open-ended tasks, use the "plan-validate-execute" pattern.

## Checklist for Effective Skills

### Core Quality

- [ ] Description is specific and includes key terms
- [ ] Description includes both what the Skill does and when to use it
- [ ] SKILL.md body is under 500 lines
- [ ] Additional details are in separate files (if needed)
- [ ] No time-sensitive information
- [ ] Consistent terminology throughout
- [ ] Examples are concrete, not abstract
- [ ] File references are one level deep
- [ ] Progressive disclosure used appropriately
- [ ] Workflows have clear steps

### Code and Scripts

- [ ] Scripts solve problems rather than punt to Claude
- [ ] Error handling is explicit and helpful
- [ ] No "voodoo constants" (all values justified)
- [ ] Required packages listed in instructions
- [ ] Scripts have clear documentation
- [ ] No Windows-style paths (all forward slashes)
- [ ] Validation/verification steps for critical operations
- [ ] Feedback loops included for quality-critical tasks

### Testing

- [ ] At least three evaluations created
- [ ] Tested with intended models
- [ ] Tested with real usage scenarios
- [ ] Team feedback incorporated (if applicable)
