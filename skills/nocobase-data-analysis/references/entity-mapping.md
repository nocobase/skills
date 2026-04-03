# Entity Mapping

Use this file as a heuristic when the user speaks in business nouns instead of exact collection names.

Do not assume these mappings are correct in every app. Verify with collection metadata before querying.

## Common business nouns

- leads -> `lead`
- users -> `users`
- accounts or customers -> `account`
- contacts -> `contact`
- opportunities -> `opportunity`
- orders -> `order`
- tickets -> `tickets`
- projects -> `projects`
- tasks -> `tasks` or `task`

## Common field categories

When exploring an unfamiliar collection, look for these field categories first:

- title or display field: `name`, `title`, or the collection `titleField`
- status field: `status`, `stage`, `state`
- owner field: `owner`, `assignee`, `manager`, `sales`
- source field: `source`, `channel`, `campaign`
- time field: `createdAt`, `updatedAt`, `closedAt`, `date`, `scheduledAt`
- numeric business field: `amount`, `revenue`, `price`, `quantity`, `score`

## Relation label heuristics

When grouping by a relation, inspect the target collection for its display field.

Common examples:

- owner label -> `["owner", "nickname"]`
- department label -> `["mainDepartment", "title"]`
- account label -> `["account", "name"]`
- contact label -> `["contact", "name"]`

Do not guess the relation label path if the target collection is unknown. Read field metadata first.

## Ambiguity rules

If multiple collections could match the same noun:

- prefer the one that best matches the user’s business context
- if still ambiguous, tell the user which collection you chose and why
- if the choice materially changes the result, surface the ambiguity explicitly
