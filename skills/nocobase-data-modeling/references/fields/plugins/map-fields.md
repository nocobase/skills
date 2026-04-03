# Plugin Fields: Map Geometry

Use this file when the requested fields are plugin-backed geometry fields such as point, line, circle, or polygon.

## Plugin gate

Typical plugin:

- `@nocobase/plugin-map`

Before using these fields:

1. confirm the map plugin is installed and enabled
2. confirm the geometry field interfaces are exposed in the current instance
3. confirm the current map provider configuration is available for the intended `mapType`

## Supported geometry field interfaces

The stable field interfaces exposed by the plugin are typically:

- `point`
- `lineString`
- `circle`
- `polygon`

These are not generic json placeholders. They are map-backed geometry interfaces.

## Common shape

All of these field interfaces typically share:

- `uiSchema.type = "void"`
- `uiSchema.x-component = "Map"`
- `uiSchema.x-component-designer = "Map.Designer"`
- plugin-specific storage type matching the interface name

## Point

```json
{
  "name": "location",
  "interface": "point",
  "type": "point",
  "uiSchema": {
    "type": "void",
    "title": "Location",
    "x-component": "Map",
    "x-component-designer": "Map.Designer",
    "x-component-props": {
      "mapType": "amap"
    }
  }
}
```

## Line

```json
{
  "name": "route",
  "interface": "lineString",
  "type": "lineString",
  "uiSchema": {
    "type": "void",
    "title": "Route",
    "x-component": "Map",
    "x-component-designer": "Map.Designer",
    "x-component-props": {
      "mapType": "amap"
    }
  }
}
```

## Circle

```json
{
  "name": "serviceArea",
  "interface": "circle",
  "type": "circle",
  "uiSchema": {
    "type": "void",
    "title": "Service area",
    "x-component": "Map",
    "x-component-designer": "Map.Designer",
    "x-component-props": {
      "mapType": "amap"
    }
  }
}
```

## Polygon

```json
{
  "name": "boundary",
  "interface": "polygon",
  "type": "polygon",
  "uiSchema": {
    "type": "void",
    "title": "Boundary",
    "x-component": "Map",
    "x-component-designer": "Map.Designer",
    "x-component-props": {
      "mapType": "amap"
    }
  }
}
```

## Important details

- do not collapse `point`, `lineString`, `circle`, and `polygon` into plain `json` when the user explicitly asked for geometry fields
- each geometry field should use its own interface and matching type
- `mapType` must follow the current plugin configuration and provider support in the instance
- available types often include the geometry type plus `json`, but use the geometry type when true map geometry behavior is intended

## Verification checklist

Verify at least:

1. the interface exists in the current instance
2. the field `type` matches the geometry interface
3. `uiSchema.x-component` is `Map`
4. `uiSchema.x-component-designer` is `Map.Designer`
5. `mapType` matches the intended provider configuration

## Anti-drift rules

- do not claim map geometry support unless the plugin is actually enabled
- do not silently replace geometry fields with plain `json`
- do not assume one geometry interface can stand in for another
- do not hard-code a provider if the current instance exposes a different configured map type
