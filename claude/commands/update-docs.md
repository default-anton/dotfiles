---
description: Guidelines for updating directory-specific documentation (CLAUDE.md files)
---

$ARGUMENTS

---

# Directory-Specific CLAUDE.md Files

## Content Guidelines: What TO Document

**Only document non-obvious, directory-specific information that provides actionable value:**

- **Unique architectural patterns** specific to this directory (not standard Rails/Test patterns)
- **Critical business logic decisions** that aren't apparent from code structure
- **Non-standard file organization** or naming conventions unique to this directory
- **Complex interdependencies** between files that aren't obvious from imports/requires
- **Performance considerations** or optimization patterns specific to this area
- **Security considerations** beyond standard Rails practices
- **Domain-specific workflows** that deviate from typical patterns
- **Key files to reference** as templates for new implementations

## Content Guidelines: What NOT to Document

**Avoid documenting standard practices that skilled developers already know:**

- ❌ Basic framework conventions (e.g., "use `app/models` for models")
- ❌ Standard Rails patterns (MVC, ActiveRecord associations, etc.)
- ❌ Common React patterns (props, state, hooks usage)
- ❌ Generic coding practices (variable naming, function organization)
- ❌ Information already covered in the root CLAUDE.md
- ❌ Obvious file purposes that are clear from directory structure
- ❌ Standard linting/formatting rules (covered by project configs)

## Format Standards

- **Laser-focused content**: Every line must provide specific, actionable guidance unique to this directory
- **Reference key files**: Point to specific files as examples rather than explaining patterns in detail
- **Use tables for comparisons**: When documenting "use X for Y, use Z for W" decisions
- **Code snippets only for non-obvious patterns**: Skip obvious examples, focus on unique implementations
