# Handover template

The file is `.handovers/<YYYY-MM-DD>-<slug>.md`. Copy the block, keep the five
headings in this order, and fill every slot.

```markdown
# <what this work is> — <YYYY-MM-DD>

## Where it stands
<branch, and the one-line state of the work>
<the command that was run and its exact result>

## Done
- <what works> — verified by <command and its result>

## Unfinished
- <what is not done> — <written but untested | blocked by X | not started>

## Decisions
- <what was decided> — because <reason>; rejected <alternative>

## Next
1. <the next action, as a command to run or a named file to change>
```

A slot with nothing in it gets the word `none`; the heading stays.
