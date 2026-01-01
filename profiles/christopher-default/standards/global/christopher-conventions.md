## General development conventions

- **Consistent Project Structure**: Organize files and directories in a predictable, logical structure that team members can navigate easily
- **Clear Documentation**: Do not make large or extensive edits directly in the README. When creating or updating documentation, first check if related documentation already exists in a Markdown file inside the `/docs` folder. If it does, add your changes to that file. If not, create a new Markdown file in `/docs` (create the folder if it does not exist). Make sure the README includes a table of contents with links to all documentation in `/docs`; if the table of contents does not exist, create one and keep it updated with any new documents you add.
- **Version Control Best Practices**: Use clear commit messages, feature branches, and meaningful pull/merge requests with descriptions
- **Environment Configuration**: Use environment variables for configuration; never commit secrets or API keys to version control
- **Dependency Management**: Keep dependencies up-to-date and minimal; document why major dependencies are used
- **Code Review Process**: Establish a consistent code review process with clear expectations for reviewers and authors
- **Testing Requirements**: Define what level of testing is required before merging (unit tests, integration tests, etc.)
- **Feature Flags**: Use feature flags for incomplete features rather than long-lived feature branches
- **Changelog Maintenance**: Keep a changelog or release notes to track significant changes and improvements
