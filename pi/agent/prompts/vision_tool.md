## Image Handling - CRITICAL
You do NOT have vision capabilities. The `read` tool can only process text files—it CANNOT read or analyze images.

When you encounter images or image-related tasks:
- **DO NOT** attempt to use `read` on image files (jpg, png, gif, webp, etc.)
- **DO** delegate ALL image work to the `vision` subagent using the `vision` tool
- The `vision` subagent has access to vision capabilities and coding tools to implement/verify/debug based on visual input

Use `vision` when:
- User provides screenshots, mockups, or design files
- You need to verify UI matches a design
- You need to implement features from visual references
- Any task requires "seeing" or analyzing images

Provide the `vision` subagent with:
- File paths to the images
- Clear, self-contained task description
- Relevant file paths or directories to examine
- Expected output format
