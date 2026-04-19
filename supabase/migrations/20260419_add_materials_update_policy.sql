-- The materials table had SELECT/INSERT/DELETE policies but no UPDATE policy.
-- With RLS enabled and no UPDATE policy, Postgres silently rejected every
-- .update() call from the client (204 response, 0 rows affected, no error).
-- That caused uploads to get stuck at processing_status='processing' forever:
-- heartbeats during chunk processing and the final status flip to 'completed'
-- all no-op'd.
--
-- This policy mirrors the pattern already in place on the other user-scoped
-- tables (mastery_state, etc.): the user can update any row whose user_id
-- matches their auth.uid().

create policy "Users can update own materials"
  on public.materials
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
