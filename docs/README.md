# MDC docs

This directory holds the **implementer-facing companions** to the spec. The project's design, research, planning, and vision notes now live in the **[project wiki](https://github.com/mdcspec/mdc/wiki)**.

## In this directory

**Spec companions** ([`docs/spec/`](spec/))

- [`implementation-contract.md`](spec/implementation-contract.md): the CLI contract every implementation satisfies (verbs, flags, exit codes).
- [`implementations.md`](spec/implementations.md): the registry of implementations and the conformance class each has earned.
- [`mdc-format-sketch.md`](spec/mdc-format-sketch.md): the long-form design walkthrough behind the normative spec.

**Adoption guides** ([`docs/adoption/`](adoption/))

- [`agent-snippet.md`](adoption/agent-snippet.md): drop-in instructions to teach a coding agent to drive MDC files.
- [`mentions-and-notifications.md`](adoption/mentions-and-notifications.md): authoring guidance for the `@assignee` token and the paste-autolink hazard.

## In the wiki

The [project wiki](https://github.com/mdcspec/mdc/wiki) carries the material that was previously under `docs/planning/`, `docs/vision/`, and `docs/research/`:

- **Planning:** [MVP Definition](https://github.com/mdcspec/mdc/wiki/MVP-Definition), [Standardization Roadmap](https://github.com/mdcspec/mdc/wiki/Standardization-Roadmap), [Launch Sequencing](https://github.com/mdcspec/mdc/wiki/Launch-Sequencing), [Experiment Plan](https://github.com/mdcspec/mdc/wiki/Experiment-Plan), [Dogfood Findings](https://github.com/mdcspec/mdc/wiki/Dogfood-Findings), [V2 CLI Ergonomics](https://github.com/mdcspec/mdc/wiki/V2-CLI-Ergonomics-Gameplan), [M0 Namespace Checklist](https://github.com/mdcspec/mdc/wiki/M0-Namespace-Checklist), [IANA Registration](https://github.com/mdcspec/mdc/wiki/IANA-Registration).
- **Vision:** [What MDC Could Unlock](https://github.com/mdcspec/mdc/wiki/What-MDC-Could-Unlock), [Risks, Critiques, and Open Questions](https://github.com/mdcspec/mdc/wiki/Risks-Critiques-and-Open-Questions).
- **Research:** [Prior Art: Checklist Formats](https://github.com/mdcspec/mdc/wiki/Prior-Art-Checklist-Formats), [Prior Art: Markdown Databases](https://github.com/mdcspec/mdc/wiki/Prior-Art-Markdown-Databases), [Standards Adoption Lessons](https://github.com/mdcspec/mdc/wiki/Standards-Adoption-Lessons), [Extension Naming Conflicts](https://github.com/mdcspec/mdc/wiki/Extension-Naming-Conflicts), [Landscape Map](https://github.com/mdcspec/mdc/wiki/Landscape-Map).
- **Spec sketch:** [MDDB Concept Sketch](https://github.com/mdcspec/mdc/wiki/MDDB-Concept-Sketch).

The normative spec itself stays in the repo: [`spec/mdc-spec-v0.1.md`](../spec/mdc-spec-v0.1.md).
