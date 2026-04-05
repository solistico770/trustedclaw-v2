## 1. Database Schema

- [ ] 1.1 Create migration with `cheds` table (id, user_id, title, context, trigger_type, interval_seconds, is_active, next_run_at, last_run_at, last_result, created_at, updated_at) with RLS policies
- [ ] 1.2 Create `ched_runs` table (id, ched_id, user_id, trigger_reason, result_text, commands_executed, duration_ms, ran_at) with RLS and CASCADE delete on ched_id
- [ ] 1.3 Add `cheds_evaluated` column to scan_logs table

## 2. API Routes

- [ ] 2.1 Create `/api/cheds` route — GET (list with ?active filter) and POST (create with validation)
- [ ] 2.2 Create `/api/cheds/[id]` route — GET (detail with recent runs), PUT (update), DELETE
- [ ] 2.3 Create `/api/cheds/[id]/toggle` route — POST to flip is_active, recalculate next_run_at on reactivation
- [ ] 2.4 Create `/api/cheds/[id]/run` route — POST to manually trigger evaluation and return result

## 3. Scanner Integration

- [ ] 3.1 Add `evaluateChed()` function in agent-scanner.ts — builds Gemini prompt with ched context + system state, parses response, executes commands, logs to ched_runs
- [ ] 3.2 Add `callChedAgent()` function in gemini-agent.ts — Gemini prompt builder and response types for ched evaluation
- [ ] 3.3 Modify scan route to track `changesOccurred` flag and add Pass 3: loop through due cheds with time budget check
- [ ] 3.4 Update scan_logs insert to include cheds_evaluated count

## 4. Admin UI

- [ ] 4.1 Create `/cheds` page — list cheds with cards showing title, trigger type, status badges, timing info, last result preview
- [ ] 4.2 Add create/edit form — title, context textarea, trigger type radio, interval input with unit selector
- [ ] 4.3 Add toggle switch, Run Now button with loading state, and expandable run history per ched
- [ ] 4.4 Add "Cheds" tab to workspace toolbar with icon, positioned after Tasks
