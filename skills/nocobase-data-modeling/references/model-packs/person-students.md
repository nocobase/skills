# Model Pack: Person And Students

Use this pack for inheritance modeling where:

- `person` owns shared identity fields
- `students` inherits from `person`
- `students` adds only child-specific fields

Collection choices:

- `person` -> `general`
- `students` -> `inherit`

## Table 1: person

```json
{
  "name": "person",
  "title": "Person",
  "template": "general",
  "autoGenId": false,
  "fields": [
    {
      "name": "id",
      "type": "snowflakeId",
      "autoIncrement": false,
      "primaryKey": true,
      "allowNull": false,
      "interface": "snowflakeId",
      "uiSchema": {
        "type": "number",
        "title": "ID",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "separator": "0.00",
          "step": "1"
        },
        "x-validator": "integer"
      }
    },
    {
      "name": "name",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Name",
        "x-component": "Input"
      }
    },
    {
      "name": "email",
      "interface": "email",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Email",
        "x-component": "Input",
        "x-validator": "email"
      }
    },
    {
      "name": "phone",
      "interface": "phone",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Phone",
        "x-component": "Input",
        "x-component-props": {
          "type": "tel"
        }
      }
    },
    {
      "name": "birthDate",
      "interface": "datetime",
      "type": "date",
      "defaultToCurrentTime": false,
      "onUpdateToCurrentTime": false,
      "timezone": false,
      "uiSchema": {
        "type": "string",
        "title": "Birth date",
        "x-component": "DatePicker",
        "x-component-props": {}
      }
    }
  ]
}
```

## Table 2: students

```json
{
  "name": "students",
  "title": "Students",
  "template": "inherit",
  "inherits": "person",
  "fields": [
    {
      "name": "studentNo",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Student no",
        "x-component": "Input"
      }
    },
    {
      "name": "grade",
      "interface": "select",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Grade",
        "x-component": "Select",
        "enum": [
          { "value": "freshman", "label": "Freshman" },
          { "value": "sophomore", "label": "Sophomore" },
          { "value": "junior", "label": "Junior" },
          { "value": "senior", "label": "Senior" }
        ]
      }
    },
    {
      "name": "score",
      "interface": "integer",
      "type": "bigInt",
      "uiSchema": {
        "type": "number",
        "title": "Score",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "step": "1"
        },
        "x-validator": "integer"
      }
    }
  ]
}
```

Verification focus:

- `students` uses `template: "inherit"` and `inherits: "person"`
- inherited person fields remain visible on the child model
- the child defines only student-specific fields
- inheritance is not replaced with manual duplicated columns
