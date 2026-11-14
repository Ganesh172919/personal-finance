## Documentation checklist

- [ ] User-visible behavior changed, so a tutorial, how-to, or reference page is updated
- [ ] New or changed environment variable, so `docs/reference/configuration.md` is updated
- [ ] New or changed API operation, so OpenAPI is regenerated and has summary, description and examples
- [ ] New alert, so a runbook exists and is linked from the alert
- [ ] Architecture or technology decision, so an ADR is added
- [ ] Prompt, model, or retrieval change, so the prompt registry, the model card and an evaluation run are updated
- [ ] Breaking change, so the changelog and an upgrade guide are updated
- [ ] No existing documentation was deleted or reworded (additions and superseded callouts only)
- [ ] `make docs-check` passes
