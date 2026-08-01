# AI Employee Knowledge-Base Binding Handoff

This skill owns capability and KB readiness. `nocobase-ai-employee-manager` owns the final employee record write.

## Preconditions

1. Current KB preflight has `runtimeCapability=available`.
2. Resolve the exact employee username for context; do not write it in this skill.
3. Verify every requested KB key exists and is enabled.
4. Confirm retrieval settings:
   - `topK`: integer 1 through 100; default 3 when user accepts defaults;
   - `score`: number 0 through 1, represented as a string in the employee write; default `"0.6"`;
   - `knowledgeBaseKeys`: non-empty exact key array when enabling.
5. Resolve `knowledgeBasePrompt`:
   - preserve an existing custom prompt unless explicitly changed;
   - otherwise use a product-style default;
   - require the literal `{knowledgeBaseData}` placeholder.

## Binding Handoff Contract

```yaml
employeeKnowledgeBaseBinding:
  environment: <env>
  username: <username>
  capability:
    requiredEdition: professional+
    entitlement: licensed | unknown
    pluginState: installed-enabled
    runtimeCapability: available
  enableKnowledgeBase: true
  knowledgeBasePrompt: |-
    From knowledge base:
    {knowledgeBaseData}
    Answer the user's question using this information.
  knowledgeBase:
    topK: 3
    score: "0.6"
    knowledgeBaseKeys:
      - product-docs
  verifiedEnabledKeys:
    - product-docs
```

Do not include secrets, full KB objects, document content, or hidden identifiers.

## Final Write Ownership

Hand the contract to `nocobase-ai-employee-manager`. That skill must:

1. read the current employee;
2. show answer-source impact and obtain confirmation;
3. update `enableKnowledgeBase`, `knowledgeBasePrompt`, and `knowledgeBase` together;
4. read back all three fields;
5. verify no unrelated writable field changed.

This KB manager must not perform a second or competing employee update.

## Unbinding Handoff

Prepare:

```yaml
employeeKnowledgeBaseUnbinding:
  environment: <env>
  username: <username>
  enableKnowledgeBase: false
  preservePromptAndSettings: true | false
  expectedImpact: <answer-source impact>
```

The employee manager obtains confirmation and performs the write. Preserve or clear prompt/settings only according to explicit user intent.

## Capability Block

If capability is unlicensed, disabled, unavailable, denied, or unknown/unusable:

- do not return a write-ready binding contract;
- state the Professional+ requirement and exact evidence;
- do not write `enableKnowledgeBase=true`;
- ask whether the user wants a separate employee operation without KB, but do not silently downgrade.

## Safety

- Do not create missing KBs implicitly.
- Do not bind disabled or ambiguous keys.
- Do not omit `knowledgeBasePrompt`.
- Do not accept a prompt missing `{knowledgeBaseData}`.
- Do not claim a bound employee works until employee-manager readback succeeds.
- If a KB disappears between handoff and employee write, the employee manager must stop and request refreshed readiness.