## Coding style best practices

- **Consistent Naming Conventions**: Establish and follow naming conventions for variables, functions, classes, and files across the codebase
- **Automated Formatting**: Maintain consistent code style (indenting, line breaks, etc.)
- **Meaningful Names**: Choose descriptive names that reveal intent; avoid abbreviations and single-letter variables except in narrow contexts
- **Small, Focused Functions**: Keep functions small and focused on a single task for better readability and testability
- **Consistent Indentation**: Use consistent indentation (spaces or tabs) and configure your editor/linter to enforce it
- **Remove Dead Code**: Delete unused code, commented-out blocks, and imports rather than leaving them as clutter
- **Backward compatibility only when required:** Unless specifically instructed otherwise, assume you do not need to write additional code logic to handle backward compatibility.
- **DRY Principle**: Avoid duplication by extracting common logic into reusable functions or modules. If a function is needed in multiple files, then that function should be moved to a util. It's okay for multiple utils to be in one file, as long as they are contextually similar.
- **Files By Purpose**: I prefer a files to be differentiated based on purpose instead of function. It's okay for multiple function to exist in 1 file, as long as they are all for the same purpose.
- **Simplicity & Readability over Efficieny**: Unless specified otherwise, prefer a simpler, less code solution that is easy to read, over a more complex but efficient method. Things should be readable at a glance.