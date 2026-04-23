# System Permissions

Use this layer for role metadata and system capability boundaries.

Primary operations:

- `roles:update`
- `roles.snippets:add`
- `roles.snippets:remove`

Primary field:

- `snippets`

Use this layer for:

- allowing or denying interface-configuration capability
- allowing or denying plugin install/enable/disable capability
- allowing or denying plugin configuration capability
- allowing or denying app-level operations such as cache clear or restart
- allowing or denying specific plugin/configuration entries such as `pm.api-doc.documentation`

Do not use system snippets as a shortcut for ordinary business-table access.

Common high-leverage snippets:

- `ui.*`
  - Allows to configure interface.
- `pm`
  - Allows to install, activate, disable plugins.
- `pm.*`
  - Allows to configure plugins.
- `app`
  - Allows to clear cache, reboot application.

General rule:

- Ordinary business roles should not receive these high-privilege snippets by default.
- If snippets are intentionally empty or fully denied, record that as a deliberate business boundary.
