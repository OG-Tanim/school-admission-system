# AI Usage

- Using DeepSeek Harness for implementing the project step by step.

## Step - 1

- Scaffolding done and the configuration reviewed before moving on to the next step.

### AI mistake

- In data modeling, AI used GUID as class and hold IDs, which is too long for path variables.

### Solution

- Custom prefixed ID generator used, along with very rare collision handling on creation endpoints.

## Step - 2

- implementation of the endpoints and their automated tests.

### AI mistake

- AI allowed duplicate class names, and only handled them with a user readable error response.

### Solution

- Duplicate class names are now rejected instead of stored: names are compared ignoring case and extra internal spaces, a unique index on the normalized name guards against races, and the request fails with the user readable `409` message "class name already exists, please create class with a different name".
