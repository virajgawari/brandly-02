-- llm_calls rows are written after the response (next/server after()), so a run row that links to its
-- call is inserted before the call exists. posts.llm_call_id has no FK for the same reason.
alter table public.agent_runs drop constraint if exists agent_runs_llm_call_id_fkey;
