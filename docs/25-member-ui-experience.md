# Member UI Experience — Simplicity and Completion Contract

## Application stages
1. Initial application: account credentials, basic identity, primary contact information and preferred communication channels only.
2. After account activation: progressive professional-profile completion using configurable reference data.
3. Required documents: show only documents required by the active verification/checklist rules.

## Completion experience
The dashboard presents one overall completion percentage plus section progress. Progress is based on active required fields/documents, not page visits. A persistent in-app alert shows the highest-priority incomplete action. Members can save and resume later.

The notification service may schedule SMS and in-app reminders for outstanding required work. Reminders must respect communication preferences, opt-out, quiet/frequency rules, delivery history and deduplication.

## Staff-assisted completion
Authorized supporting staff can open a member record and fill permitted gaps. The UI must clearly identify staff-assisted edits and audit actor, reason where required, timestamp, source and before/after values. Staff cannot impersonate the member, bypass verification, approve their own financial/verification decision, or silently alter historical membership/payment facts.

## Simplicity rules
- One primary action per screen.
- Progressive disclosure instead of one large form.
- Mobile-first responsive layout.
- Plain-language labels and concise help.
- Required and optional fields are clearly separated.
- Optional fields never block completion.
- Do not duplicate questions across screens.

## Global theme
Default brand colors: deep blue #123B6D and lemon #D9E85B. All visual tokens are globally overridable.

Strict theme contract:
- Light mode: main/background presentation is deep blue; content components use light surfaces with dark text.
- Dark mode: main/background presentation is light; content components reverse to dark surfaces with light text.
- Semantic tokens control text, surfaces, borders, controls, alerts, navigation, cards, dialogs and tables.
- No page may hard-code its own theme colors.
- Theme/contrast validation belongs in CI.
