---
title: "Notification"
description: "Explains the message configuration and failure handling options for the Notification node."
---

# Notification

## Node Type

`notification`

## Node Description
Sends a system notification; channels, recipients, and content can be configured via notification plugins.

## Business Scenario Example

* Sending an in-app notification to operational personnel when inventory is low.
* Sending email notification to user when some task is completed.

## Configuration List

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| channelName | string | None | Yes | The notification channel to use, which corresponds to the `channelName` defined in the notification channels (API: `notificationChannels:list`). Use the `name` value from the list. |
| ignoreFail | boolean | false | No | Whether to ignore failure and continue the process if sending fails. |

Other fields depend on the specific notification channel type.

### Message Configuration of `in-app-message` type

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| title | string | None | Yes | The title of the in-app message. Could use variables in title as string template. |
| content | string | None | Yes | The content of the in-app message. Could use variables in content as string template. |
| receivers | string[] \| object[] | [] | Yes | The recipients of the in-app message, specified as an array of user IDs or user queries. The query object will contains a `filter` object to describe the query condition of users collection.  See [Common Conventions - filter](../conventions/index.md#the-filter-field-in-trigger-and-node-configuration). |
| options | object | {} | No | Additional options for the in-app message. |
| options.url | string | None | The URL that the user will be directed to when they click on the message. |
| options.mobileUrl | string | None | The URL that the user will be directed to when they click on the message on a mobile device. |
| options.duration | number | 5 | The duration (in seconds) that the message will be displayed on screen. |

### Message Configuration of `email` type

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| subject | string | None | Yes | The subject of the email. |
| contentType | string | `"html"` | Yes | The content type of the email (e.g., "text" or "html"). |
| html | string | None | Yes | The HTML content of the email. Required if `contentType` is "html". |
| text | string | None | Yes | The text content of the email. Required if `contentType` is "text". |
| to | string[] | None | Yes | The recipient's email addresses. Could use variables. |
| cc | string[] | [] | No | The email addresses to be CC'd. Could use variables. |
| bcc | string[] | [] | No | The email addresses to be BCC'd. Could use variables. |

## Branch Description
Does not support branches.

## Example Configuration

### `in-app-message` type

```json
{
  "channelName": "in-app",
  "title": "Reminder",
  "content": "{{ $context.data.title }}",
  "receivers": [
    { "filter": { "$and": [{ "role.name": "admin" }]} },
    123,
  ],
  "options": {
    "url": "https://example.com/details/{{ $context.data.id }}",
    "duration": 10
  },
  "ignoreFail": false
}
```

### `email` type

```json
{
  "channelName": "email",
  "subject": "Task Completed: {{ $context.data.taskName }}",
  "contentType": "html",
  "html": "<p>The task <strong>{{ $context.data.taskName }}</strong> has been completed.</p>",
  "to": ["{{ $context.data.userEmail }}", "example@email.com"],
  "cc": ["{{ $context.data.ccEmail }}"],
  "bcc": ["{{ $context.data.bccEmail }}"],
  "ignoreFail": true
}
```

## Output Variables
This node does not output variables.
