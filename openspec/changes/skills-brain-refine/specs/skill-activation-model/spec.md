## ADDED Requirements

### Requirement: Only core skills are auto-attached
The system SHALL auto-attach only `signal-triage` and `case-management` skills. All other skills SHALL have `auto_attach: false`.

#### Scenario: Triage prompt includes only 2 auto-attached skills
- **WHEN** the triage prompt is built
- **THEN** the AUTO-ATTACHED SKILLS section SHALL contain only `signal-triage` and `case-management` instructions
- **AND** all other skills SHALL appear in AVAILABLE SKILLS with trigger conditions

#### Scenario: Case scan prompt includes only 2 auto-attached skills
- **WHEN** the case scan prompt is built
- **THEN** the AUTO-ATTACHED SKILLS section SHALL contain only `signal-triage` and `case-management` instructions

### Requirement: Skill trigger conditions shown in available skills list
The AVAILABLE SKILLS section of the prompt SHALL show each pull-on-demand skill with its trigger condition and suggested related skills.

#### Scenario: Available skills format
- **WHEN** the prompt lists available skills
- **THEN** each skill SHALL appear as: `SKILL "name" [PULL when <trigger>]: summary. Suggests: <skill1>, <skill2>`

### Requirement: Base prompt token reduction of ~40%
The auto-attach skill instructions SHALL total less than 60% of the current auto-attach token count (~2000 tokens → target ≤ 1200 tokens).

#### Scenario: Token budget verified
- **WHEN** skills are seeded and the prompt is built with auto-attach skills only
- **THEN** the total auto-attach skill instruction character count SHALL be less than 4800 characters (~1200 tokens)

### Requirement: Pull-on-demand skills work with existing 2-pass mechanism
The existing `pull_skill` command and 2-pass agent flow SHALL continue to work unchanged. Pull-on-demand skills are injected on the second pass.

#### Scenario: LLM pulls entity-create skill
- **WHEN** the LLM returns a `pull_skill` command for `entity-create` during first pass
- **THEN** the agent scanner SHALL re-run the LLM call with `entity-create` instructions injected in ACTIVE SKILL INSTRUCTIONS
- **AND** if `entity-create` suggests `entity-recall`, the LLM MAY pull that too in the second pass

### Requirement: Skill seed script updated with all 10 skills
The `scripts/create-skills.js` SHALL be rewritten to seed all 10 decomposed skills with proper `auto_attach` flags, trigger conditions in summaries, and `SUGGESTS:` sections in instructions.

#### Scenario: Fresh seed creates 10 skills
- **WHEN** `create-skills.js` runs for a user
- **THEN** exactly 10 skills SHALL be created
- **AND** exactly 2 SHALL have `auto_attach: true` (signal-triage, case-management)
- **AND** 8 SHALL have `auto_attach: false`
