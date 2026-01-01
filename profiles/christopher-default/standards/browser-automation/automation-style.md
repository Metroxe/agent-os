## Automation Best Practices

- **Automation**: When automating a flow, use the browser to confirm elements exist, don't always assume they do
- **Human-like Behaviour**: Try to mimic human behaviour when automating in a brower (etc. appropriate wait times, mouse movements, typing speed, random varaince, etc). Feel free to make utils for common human behaviour that repeats often.
- **Navigate via UI**: After initial load, prefer navigating via the UI, rather than typing in every url of where to navigate.
- **Don't assume Elements Exist After Load**: Always check an element exists before interacting with it.