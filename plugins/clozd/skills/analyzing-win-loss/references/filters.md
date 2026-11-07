# Filters

Filter values match exactly. Never type a value from memory.

1. Call `list_filters` to see which filter fields exist for the program.
2. Pick the field that fits the user's request.
3. Call `list_filter_values` for that field and copy the value exactly as returned, including case and spacing.
4. If no returned value fits, tell the user and ask. Do not guess a near match.
5. State every filter you applied in the answer.

## Example

The user asks: "Why did we lose in EMEA?" First resolve organization scope and `programId` using the skill's call order and the connected tool schema. The steps below start after program selection.

1. `list_filters` returns a region field.
2. `list_filter_values` for that field returns the allowed region values.
3. Use the returned value that matches EMEA, exactly as written, in the `get_decision_drivers` call.
4. Report "Filters applied: region = <returned value>".
