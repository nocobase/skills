---
title: "Send Email"
description: "Introduces the SMTP configuration, sender, recipient, and content fields of the email sending node."
---

# Send Email

## Node Type

`mailer`

## Node Description
Sends an email via SMTP. Upstream variables can be used to configure recipients, subject, and content.

## Business Scenario Example
Send a confirmation email to the customer after an order is completed.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| provider.host | string | None | Yes | SMTP host. |
| provider.port | number | 465 | Yes | SMTP port. |
| provider.secure | boolean | true | Yes | Whether to use TLS. |
| provider.auth.user | string | None | No | SMTP account. |
| provider.auth.pass | string | None | No | SMTP password. |
| from | string | None | Yes | Sender (e.g., `noreply <a@b.com>`). |
| to | array | [] | Yes | Recipient list (array elements can be email addresses or variables). |
| cc | array | [] | No | CC list. |
| bcc | array | [] | No | BCC list. |
| subject | string | None | No | Email subject. |
| contentType | string | html | No | Content type: `html` or `text`. |
| html | string | None | No | HTML content (when `contentType=html`). |
| text | string | None | No | Text content (when `contentType=text`). |
| ignoreFail | boolean | false | No | Whether to ignore failures and continue the workflow. |

Most fields support variable expressions following [Common Conventions - variables](../conventions/index.md#variable-expressions), allowing dynamic configuration based on workflow context. For example, the `to` field can be set to `["{{ $context.data.email }}"]` to send to an email address from the trigger data.

## Branch Description
Branches are not supported.

## Example Configuration
```json
{
  "provider": {
    "host": "smtp.example.com",
    "port": 465,
    "secure": true,
    "auth": {
      "user": "noreply@example.com",
      "pass": "********"
    }
  },
  "from": "noreply <noreply@example.com>",
  "to": ["{{ $context.data.email }}"],
  "subject": "Welcome",
  "contentType": "text",
  "text": "Hello, welcome to NocoBase",
  "ignoreFail": false
}
```

## Output Variables
This node does not output variables.
